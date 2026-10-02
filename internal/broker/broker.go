package broker

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

const (
	DefaultMainPort = 29292
	DefaultDevPort  = 29293
	BrokerSockPath  = "/tmp/modcdp-broker.sock"

	handshakeTimeout   = 500 * time.Millisecond
	heartbeatInterval  = 5 * time.Second
	heartbeatEvictAge  = 15 * time.Second
	defaultToolTimeout = 10 * time.Second
)

// BrokerError is a typed error code returned from Dispatch.
type BrokerError string

const (
	ErrBrowserUnavailable BrokerError = "BROWSER_UNAVAILABLE"
	ErrBrowserConnecting  BrokerError = "BROWSER_CONNECTING"
	ErrSessionStale       BrokerError = "SESSION_STALE"
	ErrEvalTimeout        BrokerError = "EVAL_TIMEOUT"
)

func (e BrokerError) Error() string { return string(e) }

// BrowserState is the lifecycle state of a browser slot.
type BrowserState int

const (
	StateDisconnected BrowserState = iota
	StateConnecting
	StateReady
	StateStale
)

func (s BrowserState) String() string {
	switch s {
	case StateDisconnected:
		return "DISCONNECTED"
	case StateConnecting:
		return "CONNECTING"
	case StateReady:
		return "READY"
	case StateStale:
		return "STALE"
	default:
		return "UNKNOWN"
	}
}

// BrowserSlot holds the live connection and state for one browser tag (main/dev).
type BrowserSlot struct {
	mu           sync.Mutex
	ws           *websocket.Conn
	state        BrowserState
	sessionNonce int64
	lastActivity time.Time
	info         map[string]interface{}
}

func (s *BrowserSlot) State() BrowserState {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state
}

type pendingRequest struct {
	browser string
	ch      chan []byte
}

// Config holds broker configuration.
type Config struct {
	MainPort   int
	DevPort    int
	SocketPath string
}

// IpcRequest is the JSON structure for IPC commands.
type IpcRequest struct {
	Action    string                 `json:"action"`
	Browser   string                 `json:"browser,omitempty"`
	Method    string                 `json:"method,omitempty"`
	Params    map[string]interface{} `json:"params,omitempty"`
	SessionID string                 `json:"sessionId,omitempty"`
	TimeoutMs int                    `json:"timeoutMs,omitempty"`
}

// Broker manages dual-browser WebSocket connections and routes IPC requests.
type Broker struct {
	cfg         Config
	ctx         context.Context
	cancel      context.CancelFunc
	main        BrowserSlot
	dev         BrowserSlot
	reqMu       sync.Mutex
	pendingReq  map[int64]*pendingRequest
	reqSeq      int64
	mainServer  *http.Server
	devServer   *http.Server
	ipcListener net.Listener
	upgrader    websocket.Upgrader
}

// New creates a new Broker with the given config.
func New(cfg Config) *Broker {
	ctx, cancel := context.WithCancel(context.Background())
	return &Broker{
		cfg:        cfg,
		ctx:        ctx,
		cancel:     cancel,
		pendingReq: make(map[int64]*pendingRequest),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

// slotFor returns the slot pointer for a browser tag.
func (b *Broker) slotFor(tag string) *BrowserSlot {
	if tag == "dev" {
		return &b.dev
	}
	return &b.main
}

// Start launches the broker: orphan socket cleanup, TCP listeners, Unix IPC.
func (b *Broker) Start(ctx context.Context) error {
	b.ctx = ctx

	// --- Orphan Unix socket cleanup ---
	socketPath := b.cfg.SocketPath
	if socketPath == "" {
		socketPath = BrokerSockPath
	}
	conn, err := net.DialTimeout("unix", socketPath, 200*time.Millisecond)
	if err == nil {
		conn.Close()
		return fmt.Errorf("another modcdp-mcp instance is already running on %s", socketPath)
	}
	// Dead socket file → unlink
	os.Remove(socketPath)

	// --- WebSocket HTTP servers ---
	mainPort := b.cfg.MainPort
	if mainPort == 0 {
		mainPort = DefaultMainPort
	}
	devPort := b.cfg.DevPort
	if devPort == 0 {
		devPort = DefaultDevPort
	}

	mainMux := http.NewServeMux()
	mainMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		b.handleWSUpgrade(w, r, "main", &b.main)
	})
	b.mainServer = &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", mainPort), Handler: mainMux}

	devMux := http.NewServeMux()
	devMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		b.handleWSUpgrade(w, r, "dev", &b.dev)
	})
	b.devServer = &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", devPort), Handler: devMux}

	mainLn, err := net.Listen("tcp", b.mainServer.Addr)
	if err != nil {
		return fmt.Errorf("port %d: %w", mainPort, err)
	}
	devLn, err := net.Listen("tcp", b.devServer.Addr)
	if err != nil {
		mainLn.Close()
		return fmt.Errorf("port %d: %w", devPort, err)
	}

	ipcLn, err := net.Listen("unix", socketPath)
	if err != nil {
		mainLn.Close()
		devLn.Close()
		return fmt.Errorf("unix socket %s: %w", socketPath, err)
	}
	b.ipcListener = ipcLn

	go b.mainServer.Serve(mainLn)
	go b.devServer.Serve(devLn)
	go b.acceptIpcLoop()

	// Heartbeat monitors
	go b.heartbeatMonitor(&b.main, "main")
	go b.heartbeatMonitor(&b.dev, "dev")

	fmt.Printf("[Broker] Listening on main=%d dev=%d ipc=%s\n", mainPort, devPort, socketPath)
	return nil
}

// handleWSUpgrade upgrades an HTTP connection to WebSocket and enforces the hello handshake.
func (b *Broker) handleWSUpgrade(w http.ResponseWriter, r *http.Request, browserType string, slot *BrowserSlot) {
	conn, err := b.upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Printf("[Broker] WS upgrade error (%s): %v\n", browserType, err)
		return
	}

	// Enforce hello handshake within handshakeTimeout
	conn.SetReadDeadline(time.Now().Add(handshakeTimeout))
	_, msg, err := conn.ReadMessage()
	if err != nil {
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(1002, "handshake_timeout"))
		conn.Close()
		return
	}
	conn.SetReadDeadline(time.Time{})

	var hello struct {
		Type         string `json:"type"`
		BrowserTag   string `json:"browser_tag"`
		ExtVersion   string `json:"extension_version"`
		SessionNonce int64  `json:"session_nonce"`
		BuildHash    string `json:"build_hash"`
	}
	if err := json.Unmarshal(msg, &hello); err != nil || hello.Type != "hello" {
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(1002, "invalid_handshake"))
		conn.Close()
		return
	}

	slot.mu.Lock()
	if slot.state == StateReady && slot.sessionNonce >= hello.SessionNonce {
		// Incoming nonce is not newer → reject as stale
		slot.mu.Unlock()
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(1008, "stale_nonce"))
		conn.Close()
		return
	}
	// Evict old connection if any
	if slot.ws != nil {
		old := slot.ws
		go func() {
			old.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(1001, "superseded"))
			old.Close()
		}()
	}
	slot.ws = conn
	slot.state = StateReady
	slot.sessionNonce = hello.SessionNonce
	slot.lastActivity = time.Now()
	slot.mu.Unlock()

	fmt.Printf("[Broker] %s connected — nonce=%d version=%s build=%s\n",
		browserType, hello.SessionNonce, hello.ExtVersion, hello.BuildHash)

	b.readExtensionLoop(conn, browserType, slot)
}

// readExtensionLoop reads messages from the extension WS until disconnect.
func (b *Broker) readExtensionLoop(conn *websocket.Conn, browserType string, slot *BrowserSlot) {
	defer func() {
		fmt.Printf("[Broker] %s extension disconnected\n", browserType)
		slot.mu.Lock()
		if slot.ws == conn {
			slot.ws = nil
			slot.state = StateDisconnected
			slot.info = nil
		}
		slot.mu.Unlock()
		conn.Close()
		b.failPendingForBrowser(browserType,
			fmt.Sprintf("Browser '%s' disconnected while awaiting response.", browserType))
	}()

	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			break
		}

		// Update activity timestamp for heartbeat tracking
		slot.mu.Lock()
		slot.lastActivity = time.Now()
		slot.mu.Unlock()

		var generic map[string]interface{}
		if err := json.Unmarshal(msgBytes, &generic); err != nil {
			continue
		}

		// Handle application-level ping from extension
		if t, ok := generic["type"].(string); ok && t == "ping" {
			continue
		}

		// Handle hello/handshake info update
		if t, ok := generic["type"].(string); ok && t == "modcdp.reverse.hello" {
			slot.mu.Lock()
			slot.info = generic
			slot.mu.Unlock()
			prettyInfo, _ := json.MarshalIndent(generic, "", "  ")
			fmt.Printf("[Broker] Handshake info from %s: %s\n", browserType, string(prettyInfo))
			continue
		}

		// Match response to pending request by ID
		var idNum int64
		hasID := false
		if rawID, exists := generic["id"]; exists && rawID != nil {
			switch v := rawID.(type) {
			case float64:
				idNum = int64(v)
				hasID = true
			case int64:
				idNum = v
				hasID = true
			case int:
				idNum = int64(v)
				hasID = true
			case json.Number:
				if n, err := v.Int64(); err == nil {
					idNum = n
					hasID = true
				}
			case string:
				if n, err := strconv.ParseInt(v, 10, 64); err == nil {
					idNum = n
					hasID = true
				}
			}
		}

		if hasID {
			b.reqMu.Lock()
			req, ok := b.pendingReq[idNum]
			if ok {
				delete(b.pendingReq, idNum)
			}
			b.reqMu.Unlock()
			if ok {
				select {
				case req.ch <- msgBytes:
				default:
				}
			}
		}
	}
}

// heartbeatMonitor evicts slots that have been silent for heartbeatEvictAge.
func (b *Broker) heartbeatMonitor(slot *BrowserSlot, tag string) {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-b.ctx.Done():
			return
		case <-ticker.C:
			slot.mu.Lock()
			if slot.state == StateReady && time.Since(slot.lastActivity) > heartbeatEvictAge {
				fmt.Printf("[Broker] heartbeat timeout on %s — evicting\n", tag)
				slot.state = StateStale
				if slot.ws != nil {
					slot.ws.WriteMessage(websocket.CloseMessage,
						websocket.FormatCloseMessage(1001, "heartbeat_timeout"))
					slot.ws.Close()
					slot.ws = nil
				}
				slot.state = StateDisconnected
				slot.mu.Unlock()
				b.failPendingForBrowser(tag, "SESSION_STALE: heartbeat timeout")
			} else {
				slot.mu.Unlock()
			}
		}
	}
}

// failPendingForBrowser resolves all in-flight requests for a browser with an error.
func (b *Broker) failPendingForBrowser(browser, msg string) {
	errResp, _ := json.Marshal(map[string]interface{}{
		"error": map[string]interface{}{
			"code":    "SESSION_STALE",
			"message": msg,
		},
	})
	b.reqMu.Lock()
	defer b.reqMu.Unlock()
	for id, req := range b.pendingReq {
		if req.browser == browser {
			select {
			case req.ch <- errResp:
			default:
			}
			delete(b.pendingReq, id)
		}
	}
}

// acceptIpcLoop accepts Unix socket connections.
func (b *Broker) acceptIpcLoop() {
	for {
		conn, err := b.ipcListener.Accept()
		if err != nil {
			select {
			case <-b.ctx.Done():
				return
			default:
				return
			}
		}
		go b.handleIpcConnection(conn)
	}
}

// handleIpcConnection handles one IPC client session.
func (b *Broker) handleIpcConnection(conn net.Conn) {
	defer conn.Close()
	reader := bufio.NewReader(conn)
	for {
		line, err := reader.ReadBytes('\n')
		line = bytes.TrimSpace(line)
		if len(line) > 0 {
			res := b.handleIpcRequest(line)
			if res != nil {
				res = bytes.TrimSpace(res)
				_, _ = conn.Write(append(res, '\n'))
			}
		}
		if err != nil {
			break
		}
	}
}

// handleIpcRequest processes a single IPC request and returns the JSON response.
func (b *Broker) handleIpcRequest(data []byte) []byte {
	var req IpcRequest
	if err := json.Unmarshal(data, &req); err != nil {
		errResp, _ := json.Marshal(map[string]interface{}{
			"error": map[string]interface{}{"code": -32603, "message": err.Error()},
		})
		return errResp
	}

	switch req.Action {
	case "status":
		b.main.mu.Lock()
		mainState := b.main.state.String()
		mainInfo := b.main.info
		b.main.mu.Unlock()

		b.dev.mu.Lock()
		devState := b.dev.state.String()
		devInfo := b.dev.info
		b.dev.mu.Unlock()

		out, _ := json.Marshal(map[string]interface{}{
			"main": map[string]interface{}{"state": mainState, "info": mainInfo},
			"dev":  map[string]interface{}{"state": devState, "info": devInfo},
		})
		return out

	case "send":
		return b.handleSendRequest(req)

	default:
		out, _ := json.Marshal(map[string]interface{}{
			"error": map[string]interface{}{
				"code": -32601, "message": fmt.Sprintf("Unknown action '%s'", req.Action),
			},
		})
		return out
	}
}

// handleSendRequest forwards a CDP command to a browser slot and waits for the response.
func (b *Broker) handleSendRequest(req IpcRequest) []byte {
	target := req.Browser
	if target == "" || target == "any" {
		b.main.mu.Lock()
		mainReady := b.main.state == StateReady
		b.main.mu.Unlock()
		b.dev.mu.Lock()
		devReady := b.dev.state == StateReady
		b.dev.mu.Unlock()

		if mainReady {
			target = "main"
		} else if devReady {
			target = "dev"
		} else {
			return b.browserUnavailableErr(target)
		}
	}

	slot := b.slotFor(target)
	slot.mu.Lock()
	state := slot.state
	wsConn := slot.ws
	slot.mu.Unlock()

	if state != StateReady || wsConn == nil {
		return b.browserUnavailableErr(target)
	}

	if req.Method == "" {
		out, _ := json.Marshal(map[string]interface{}{
			"error": map[string]interface{}{"code": -32602, "message": "Missing 'method' in send request"},
		})
		return out
	}

	id := atomic.AddInt64(&b.reqSeq, 1)
	payloadMap := map[string]interface{}{
		"id":     id,
		"method": req.Method,
		"params": req.Params,
	}
	if payloadMap["params"] == nil {
		payloadMap["params"] = map[string]interface{}{}
	}
	if req.SessionID != "" {
		payloadMap["sessionId"] = req.SessionID
	}

	payloadBytes, err := json.Marshal(payloadMap)
	if err != nil {
		out, _ := json.Marshal(map[string]interface{}{
			"error": map[string]interface{}{"code": -32603, "message": err.Error()},
		})
		return out
	}

	respCh := make(chan []byte, 1)
	b.reqMu.Lock()
	b.pendingReq[id] = &pendingRequest{browser: target, ch: respCh}
	b.reqMu.Unlock()

	slot.mu.Lock()
	err = wsConn.WriteMessage(websocket.TextMessage, payloadBytes)
	slot.mu.Unlock()
	if err != nil {
		b.reqMu.Lock()
		delete(b.pendingReq, id)
		b.reqMu.Unlock()
		return b.browserUnavailableErr(target)
	}

	timeoutMs := req.TimeoutMs
	if timeoutMs <= 0 {
		timeoutMs = 10000 // 10s default
	}

	select {
	case respBytes := <-respCh:
		return respBytes
	case <-time.After(time.Duration(timeoutMs) * time.Millisecond):
		b.reqMu.Lock()
		delete(b.pendingReq, id)
		b.reqMu.Unlock()
		out, _ := json.Marshal(map[string]interface{}{
			"error": map[string]interface{}{
				"code":    "EVAL_TIMEOUT",
				"message": fmt.Sprintf("Command '%s' timed out after %dms for browser '%s'.", req.Method, timeoutMs, target),
			},
		})
		return out
	case <-b.ctx.Done():
		b.reqMu.Lock()
		delete(b.pendingReq, id)
		b.reqMu.Unlock()
		out, _ := json.Marshal(map[string]interface{}{
			"error": map[string]interface{}{"code": "SESSION_STALE", "message": "Broker stopping"},
		})
		return out
	}
}

func (b *Broker) browserUnavailableErr(browser string) []byte {
	out, _ := json.Marshal(map[string]interface{}{
		"error": map[string]interface{}{
			"code":    "BROWSER_UNAVAILABLE",
			"message": fmt.Sprintf("BROWSER_UNAVAILABLE: No browser extension is connected for '%s'. Load the modcdp extension in Chrome and ensure it shows 'Connected'.", browser),
		},
	})
	return out
}

// Stop gracefully shuts down the broker.
func (b *Broker) Stop() {
	b.cancel()

	// Notify all in-flight requests
	stopErr, _ := json.Marshal(map[string]interface{}{
		"error": map[string]interface{}{"code": "SESSION_STALE", "message": "Broker stopping"},
	})
	b.reqMu.Lock()
	for id, req := range b.pendingReq {
		select {
		case req.ch <- stopErr:
		default:
		}
		delete(b.pendingReq, id)
	}
	b.reqMu.Unlock()

	// Close WS connections
	b.main.mu.Lock()
	if b.main.ws != nil {
		b.main.ws.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(1001, "server_stopping"))
		b.main.ws.Close()
		b.main.ws = nil
	}
	b.main.mu.Unlock()

	b.dev.mu.Lock()
	if b.dev.ws != nil {
		b.dev.ws.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(1001, "server_stopping"))
		b.dev.ws.Close()
		b.dev.ws = nil
	}
	b.dev.mu.Unlock()

	if b.mainServer != nil {
		b.mainServer.Close()
	}
	if b.devServer != nil {
		b.devServer.Close()
	}
	if b.ipcListener != nil {
		b.ipcListener.Close()
	}
	socketPath := b.cfg.SocketPath
	if socketPath == "" {
		socketPath = BrokerSockPath
	}
	os.Remove(socketPath)
	fmt.Println("[Broker] Stopped")
}

// SocketPath returns the Unix socket path used by this broker.
func (b *Broker) SocketPath() string {
	if b.cfg.SocketPath != "" {
		return b.cfg.SocketPath
	}
	return BrokerSockPath
}

package broker_test

import (
	"context"
	"encoding/json"
	"net"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/dawgctor/modcdp-mcp/internal/broker"
)


func freeSock(t *testing.T) string {
	t.Helper()
	// macOS Unix socket paths are limited to 104 characters; t.TempDir() is too long.
	p := "/tmp/modcdp-test-" + strconv.FormatInt(time.Now().UnixNano()%100000, 10) + ".sock"
	t.Cleanup(func() { os.Remove(p) })
	return p
}


func startBroker(t *testing.T, mainPort, devPort int, sockPath string) *broker.Broker {
	t.Helper()
	b := broker.New(broker.Config{
		MainPort:   mainPort,
		DevPort:    devPort,
		SocketPath: sockPath,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)
	t.Cleanup(b.Stop)
	if err := b.Start(ctx); err != nil {
		t.Fatalf("broker.Start: %v", err)
	}
	time.Sleep(60 * time.Millisecond)
	return b
}

func ipcStatus(t *testing.T, sockPath string) map[string]interface{} {
	t.Helper()
	conn, err := net.Dial("unix", sockPath)
	if err != nil {
		t.Fatalf("ipc dial: %v", err)
	}
	defer conn.Close()
	req, _ := json.Marshal(map[string]interface{}{"action": "status"})
	conn.Write(append(req, '\n'))
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 4096)
	n, _ := conn.Read(buf)
	var resp map[string]interface{}
	json.Unmarshal(buf[:n], &resp)
	return resp
}

// Each test uses a distinct port range to avoid conflicts.

func TestDispatchBrowserUnavailableViaStatus(t *testing.T) {
	sock := freeSock(t)
	b := startBroker(t, 29392, 29393, sock)
	_ = b

	resp := ipcStatus(t, sock)
	mainMap, ok := resp["main"].(map[string]interface{})
	if !ok {
		t.Fatalf("status response missing 'main': %v", resp)
	}
	mainState := mainMap["state"].(string)
	if mainState != "DISCONNECTED" {
		t.Fatalf("expected DISCONNECTED, got %s", mainState)
	}
	devMap := resp["dev"].(map[string]interface{})
	devState := devMap["state"].(string)
	if devState != "DISCONNECTED" {
		t.Fatalf("expected DISCONNECTED for dev, got %s", devState)
	}
}

func TestOrphanSocketCleanup(t *testing.T) {
	sockPath := "/tmp/modcdp-orphan-" + strconv.FormatInt(time.Now().UnixNano()%100000, 10) + ".sock"
	t.Cleanup(func() { os.Remove(sockPath) })

	// Create a stale socket file by binding and immediately closing
	l, err := net.Listen("unix", sockPath)
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	l.Close() // leaves dead socket file on disk

	b := broker.New(broker.Config{
		MainPort:   29492,
		DevPort:    29493,
		SocketPath: sockPath,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	defer b.Stop()

	if err := b.Start(ctx); err != nil {
		t.Fatalf("Start failed on orphan socket: %v", err)
	}
	// Verify broker is listening on the socket
	conn, err := net.Dial("unix", sockPath)
	if err != nil {
		t.Fatalf("broker socket not accessible after orphan cleanup: %v", err)
	}
	conn.Close()
}

func TestBrokerStopCleansSocket(t *testing.T) {
	sockPath := "/tmp/modcdp-clean-" + strconv.FormatInt(time.Now().UnixNano()%100000, 10) + ".sock"
	t.Cleanup(func() { os.Remove(sockPath) })

	b := broker.New(broker.Config{
		MainPort:   29592,
		DevPort:    29593,
		SocketPath: sockPath,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := b.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}
	time.Sleep(50 * time.Millisecond)
	b.Stop()

	// After Stop, connecting to the socket should fail
	if conn, err := net.Dial("unix", sockPath); err == nil {
		conn.Close()
		t.Fatal("expected socket to be removed after Stop, but connection succeeded")
	}
}

func TestDuplicateInstanceRejected(t *testing.T) {
	sockPath := "/tmp/modcdp-dup-" + strconv.FormatInt(time.Now().UnixNano()%100000, 10) + ".sock"
	t.Cleanup(func() { os.Remove(sockPath) })

	// Start first broker
	b1 := broker.New(broker.Config{MainPort: 29692, DevPort: 29693, SocketPath: sockPath})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	defer b1.Stop()
	if err := b1.Start(ctx); err != nil {
		t.Fatalf("first broker Start: %v", err)
	}
	time.Sleep(60 * time.Millisecond)

	// Attempt to start a second broker on same socket — must fail
	b2 := broker.New(broker.Config{MainPort: 29792, DevPort: 29793, SocketPath: sockPath})
	if err := b2.Start(ctx); err == nil {
		b2.Stop()
		t.Fatal("expected second broker to fail due to duplicate socket, but it succeeded")
	}
}

func TestSocketPathAccessor(t *testing.T) {
	sockPath := t.TempDir() + "/accessor.sock"
	b := broker.New(broker.Config{MainPort: 29892, DevPort: 29893, SocketPath: sockPath})
	if b.SocketPath() != sockPath {
		t.Fatalf("SocketPath() = %q, want %q", b.SocketPath(), sockPath)
	}
	_ = strconv.Itoa(29892) // ensure strconv import used
}

func TestBrokerRFC6455PingPong(t *testing.T) {
	sock := freeSock(t)
	b := startBroker(t, 29882, 29883, sock)
	_ = b

	wsURL := "ws://127.0.0.1:29882"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("ws dial: %v", err)
	}
	defer conn.Close()

	// Channel to signal received ping from broker
	pingReceived := make(chan string, 10)
	conn.SetPingHandler(func(appData string) error {
		pingReceived <- appData
		return conn.WriteControl(websocket.PongMessage, []byte(appData), time.Now().Add(time.Second))
	})

	// Read messages in background so SetPingHandler is executed
	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	// Perform hello handshake
	hello := map[string]interface{}{
		"type":              "hello",
		"browser_tag":       "main",
		"extension_version": "0.2.0",
		"session_nonce":     time.Now().UnixNano(),
	}
	if err := conn.WriteJSON(hello); err != nil {
		t.Fatalf("write hello: %v", err)
	}

	// Verify status is READY
	resp := ipcStatus(t, sock)
	mainMap := resp["main"].(map[string]interface{})
	if mainMap["state"] != "READY" {
		t.Fatalf("expected state READY, got %v", mainMap["state"])
	}

	// Wait up to 12s for broker's 10s ticker ping
	select {
	case tag := <-pingReceived:
		if tag != "main" {
			t.Fatalf("expected ping payload 'main', got %q", tag)
		}
	case <-time.After(12 * time.Second):
		t.Fatal("timed out waiting for RFC 6455 ping from broker")
	}

	// Verify status remains READY
	respAfter := ipcStatus(t, sock)
	mainMapAfter := respAfter["main"].(map[string]interface{})
	if mainMapAfter["state"] != "READY" {
		t.Fatalf("expected state READY after ping/pong, got %v", mainMapAfter["state"])
	}
}

func TestBrokerOriginValidation(t *testing.T) {
	sock := freeSock(t)
	b := startBroker(t, 29872, 29873, sock)
	_ = b

	wsURL := "ws://127.0.0.1:29872"

	// 1. chrome-extension:// origin must succeed
	h1 := make(map[string][]string)
	h1["Origin"] = []string{"chrome-extension://mdedooklbnfejodmnhmkdpkaedafkehf"}
	conn1, _, err1 := websocket.DefaultDialer.Dial(wsURL, h1)
	if err1 != nil {
		t.Fatalf("expected chrome-extension origin to succeed, got %v", err1)
	}
	conn1.Close()

	// 2. Untrusted website origin must fail (HTTP 403 Forbidden)
	h2 := make(map[string][]string)
	h2["Origin"] = []string{"https://malicious-website.com"}
	_, resp2, err2 := websocket.DefaultDialer.Dial(wsURL, h2)
	if err2 == nil {
		t.Fatal("expected untrusted origin to be rejected, but connection succeeded")
	}
	if resp2 != nil && resp2.StatusCode != 403 {
		t.Fatalf("expected HTTP 403 Forbidden, got %d", resp2.StatusCode)
	}

	// 3. Domain suffix spoofing (e.g. http://127.0.0.1.evil.com) must be rejected
	h3 := make(map[string][]string)
	h3["Origin"] = []string{"http://127.0.0.1.evil.com"}
	_, resp3, err3 := websocket.DefaultDialer.Dial(wsURL, h3)
	if err3 == nil {
		t.Fatal("expected suffix-spoofed 127.0.0.1 origin to be rejected, but connection succeeded")
	}
	if resp3 != nil && resp3.StatusCode != 403 {
		t.Fatalf("expected HTTP 403 Forbidden for suffix spoofing, got %d", resp3.StatusCode)
	}

	// 4. Domain suffix spoofing (e.g. http://localhost.attacker.com) must be rejected
	h4 := make(map[string][]string)
	h4["Origin"] = []string{"http://localhost.attacker.com"}
	_, resp4, err4 := websocket.DefaultDialer.Dial(wsURL, h4)
	if err4 == nil {
		t.Fatal("expected suffix-spoofed localhost origin to be rejected, but connection succeeded")
	}
	if resp4 != nil && resp4.StatusCode != 403 {
		t.Fatalf("expected HTTP 403 Forbidden for suffix spoofing, got %d", resp4.StatusCode)
	}

	// 5. Unauthorized foreign extension ID (not CanonicalExtensionID) must be rejected
	h5 := make(map[string][]string)
	h5["Origin"] = []string{"chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
	_, resp5, err5 := websocket.DefaultDialer.Dial(wsURL, h5)
	if err5 == nil {
		t.Fatal("expected unauthorized foreign extension origin to be rejected, but connection succeeded")
	}
	if resp5 != nil && resp5.StatusCode != 403 {
		t.Fatalf("expected HTTP 403 Forbidden for foreign extension, got %d", resp5.StatusCode)
	}
}

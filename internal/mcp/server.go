package mcp

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"
)

type JsonRpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

var imageRegex = regexp.MustCompile(`^data:([^;]+);base64,(.+)$`)

func SendToBroker(sockPath string, req map[string]interface{}, retries int) (map[string]interface{}, error) {
	conn, err := net.Dial("unix", sockPath)
	if err != nil {
		if retries > 0 {
			// Auto-spawn broker in background
			exe, exeErr := os.Executable()
			if exeErr == nil {
				// Don't auto-spawn if running inside a test binary
				if !strings.HasSuffix(exe, ".test") {
					cmd := exec.Command(exe, "broker", "--socket-path="+sockPath)
					cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
					cmd.Stdin = nil
					cmd.Stdout = nil
					cmd.Stderr = nil
					_ = cmd.Start()
				}

				// Wait up to 2000ms for broker socket to be available
				for i := 0; i < 40; i++ {
					time.Sleep(50 * time.Millisecond)
					testConn, dialErr := net.Dial("unix", sockPath)
					if dialErr == nil {
						testConn.Close()
						break
					}
				}

				return SendToBroker(sockPath, req, retries-1)
			}
		}
		return nil, err
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(30 * time.Second))

	reqBytes, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	if _, err := conn.Write(append(reqBytes, '\n')); err != nil {
		return nil, err
	}

	reader := bufio.NewReader(conn)
	for {
		line, err := reader.ReadBytes('\n')
		line = bytes.TrimSpace(line)
		if len(line) == 0 {
			if err != nil {
				return nil, err
			}
			continue
		}

		var resp map[string]interface{}
		if err := json.Unmarshal(line, &resp); err != nil {
			return nil, err
		}
		return resp, nil
	}
}

func formatResult(v interface{}) string {
	if v == nil {
		return "null"
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Sprintf("%v", v)
	}
	return string(b)
}

func RunMcpServer(in io.Reader, out io.Writer, sockPath string) error {
	reader := bufio.NewReader(in)
	writer := bufio.NewWriter(out)
	var writeMu sync.Mutex
	var wg sync.WaitGroup

	sendResponse := func(id json.RawMessage, result interface{}) {
		resp := map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      id,
			"result":  result,
		}
		b, _ := json.Marshal(resp)
		writeMu.Lock()
		_, _ = writer.Write(append(b, '\n'))
		_ = writer.Flush()
		writeMu.Unlock()
	}

	sendError := func(id json.RawMessage, code int, message string, data interface{}) {
		errObj := map[string]interface{}{
			"code":    code,
			"message": message,
		}
		if data != nil {
			errObj["data"] = data
		}
		resp := map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      id,
			"error":   errObj,
		}
		b, _ := json.Marshal(resp)
		writeMu.Lock()
		_, _ = writer.Write(append(b, '\n'))
		_ = writer.Flush()
		writeMu.Unlock()
	}

	handleRequest := func(req JsonRpcRequest) {
		defer wg.Done()

		switch req.Method {
		case "initialize":
			sendResponse(req.ID, map[string]interface{}{
				"protocolVersion": "2024-11-05",
				"capabilities": map[string]interface{}{
					"tools": map[string]interface{}{},
				},
				"serverInfo": map[string]interface{}{
					"name":    "modcdp-mcp",
					"version": "1.0.0",
				},
			})

		case "tools/list":
			sendResponse(req.ID, map[string]interface{}{
				"tools": Tools,
			})

		case "tools/call":
			var callParams struct {
				Name      string                 `json:"name"`
				Arguments map[string]interface{} `json:"arguments"`
			}
			if len(req.Params) > 0 {
				_ = json.Unmarshal(req.Params, &callParams)
			}
			if callParams.Arguments == nil {
				callParams.Arguments = make(map[string]interface{})
			}

			cmd, err := BuildCommandForTool(callParams.Name, callParams.Arguments)
			if err != nil {
				sendError(req.ID, -32601, fmt.Sprintf("Tool error: %s", err.Error()), nil)
				return
			}

			brokerReq := map[string]interface{}{
				"action":  "send",
				"browser": cmd.Browser,
				"method":  cmd.Method,
				"params":  cmd.Params,
			}
			brokerRes, err := SendToBroker(sockPath, brokerReq, 2)
			if err != nil {
				sendResponse(req.ID, map[string]interface{}{
					"isError": true,
					"content": []map[string]interface{}{
						{
							"type": "text",
							"text": fmt.Sprintf("Execution failed: %s", err.Error()),
						},
					},
				})
				return
			}

			// Check if broker returned an error
			if errVal, exists := brokerRes["error"]; exists && errVal != nil {
				// Try fallback expression if available
				if cmd.FallbackExpression != "" {
					fallbackReq := map[string]interface{}{
						"action":  "send",
						"browser": cmd.Browser,
						"method":  "Mod.evaluate",
						"params": map[string]interface{}{
							"expression": cmd.FallbackExpression,
						},
					}
					fallbackRes, fbErr := SendToBroker(sockPath, fallbackReq, 1)
					if fbErr == nil && fallbackRes["error"] == nil {
						sendResponse(req.ID, map[string]interface{}{
							"content": []map[string]interface{}{
								{
									"type": "text",
									"text": formatResult(fallbackRes["result"]),
								},
							},
						})
						return
					}
				}

				var errMsg string
				if errMap, ok := errVal.(map[string]interface{}); ok {
					if msgStr, ok := errMap["message"].(string); ok {
						errMsg = msgStr
					} else {
						raw, _ := json.Marshal(errMap)
						errMsg = string(raw)
					}
				} else {
					errMsg = fmt.Sprintf("%v", errVal)
				}

				sendResponse(req.ID, map[string]interface{}{
					"isError": true,
					"content": []map[string]interface{}{
						{
							"type": "text",
							"text": fmt.Sprintf("Broker error: %s", errMsg),
						},
					},
				})
				return
			}

			// Check if response contains an image
			if resMap, ok := brokerRes["result"].(map[string]interface{}); ok && resMap != nil {
				if dataURL, ok := resMap["dataUrl"].(string); ok {
					if matches := imageRegex.FindStringSubmatch(dataURL); matches != nil {
						sendResponse(req.ID, map[string]interface{}{
							"content": []map[string]interface{}{
								{
									"type":     "image",
									"mimeType": matches[1],
									"data":     matches[2],
								},
							},
						})
						return
					}
				}
			}

			sendResponse(req.ID, map[string]interface{}{
				"content": []map[string]interface{}{
					{
						"type": "text",
						"text": formatResult(brokerRes["result"]),
					},
				},
			})

		default:
			sendError(req.ID, -32601, fmt.Sprintf("Method not found: %s", req.Method), nil)
		}
	}

	for {
		line, readErr := reader.ReadBytes('\n')
		line = bytes.TrimSpace(line)
		if len(line) > 0 {
			var req JsonRpcRequest
			if err := json.Unmarshal(line, &req); err != nil {
				sendError(nil, -32700, "Parse error", nil)
				if readErr != nil {
					break
				}
				continue
			}

			// Handle notifications (no ID or null ID)
			if len(req.ID) == 0 || string(req.ID) == "null" {
				if req.Method == "notifications/initialized" {
					// initialized notification
				}
				if readErr != nil {
					break
				}
				continue
			}

			wg.Add(1)
			go handleRequest(req)
		}

		if readErr != nil {
			break
		}
	}

	wg.Wait()
	return nil
}

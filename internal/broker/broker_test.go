package broker_test

import (
	"context"
	"encoding/json"
	"net"
	"os"
	"strconv"
	"testing"
	"time"

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

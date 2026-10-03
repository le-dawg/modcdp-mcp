# Contributing to ModCDP-MCP

Thank you for your interest in contributing to `modcdp-mcp`! We welcome bug reports, documentation enhancements, feature proposals, and code contributions.

Please review this document to understand the system architecture, development setup, and testing workflow.

---

## Code of Conduct

All contributors and maintainers are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please report any violations to [security@0xdawg.com](mailto:security@0xdawg.com) or [@le-dawg](https://github.com/le-dawg).

---

## Architecture Overview

`modcdp-mcp` bridges native AI agent harnesses (Claude Code, OpenAI Codex, Gemini Antigravity, GitHub Copilot) to Google Chrome without tripping Chrome 136/144+ remote debugging consent dialogs.

The codebase consists of three primary layers:

```
┌────────────────────────────────────────────────────────┐
│ AI Coding Agent (Claude Code / Codex / Antigravity)    │
└───────────────────────────┬────────────────────────────┘
                            │ Standard stdio (MCP JSON-RPC 2.0)
                            ▼
┌────────────────────────────────────────────────────────┐
│ Native MCP Server CLI (bin/modcdp-mcp)                 │
└───────────────────────────┬────────────────────────────┘
                            │ Unix Domain Socket IPC (/tmp/modcdp-broker.sock)
                            ▼
┌────────────────────────────────────────────────────────┐
│ Go Broker Daemon (launchd persistent service)          │
│  ├─ Dual-Browser Multiplexer (Main :29292 / Dev :29293)│
│  ├─ Monotonic Session Nonce Guard                      │
│  └─ Heartbeat Eviction (15s timeout)                   │
└──────────────┬──────────────────────────┬──────────────┘
               │ Reverse WS (:29292)      │ Reverse WS (:29293)
               ▼                          ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ Main Chrome Extension (MV3)  │ │ Chrome Dev Extension (MV3)   │
│  ├─ Service Worker           │ │  ├─ Service Worker           │
│  ├─ Offscreen Keepalive      │ │  ├─ Offscreen Keepalive      │
│  └─ Active User Tabs         │ │  └─ Active Dev Tabs          │
└──────────────────────────────┘ └──────────────────────────────┘
```

1. **Native MCP Server (`internal/mcp/`)**:
   - Implements the Model Context Protocol (`protocolVersion: 2024-11-05`) over standard `stdio`.
   - Parses incoming JSON-RPC 2.0 requests (`initialize`, `tools/list`, `tools/call`).
   - Dispatches tool commands to the broker over Unix domain socket `/tmp/modcdp-broker.sock`.
   - Auto-spawns the background broker daemon if not already running.

2. **Go Broker Daemon (`internal/broker/`)**:
   - Manages WebSocket listener endpoints on loopback: `127.0.0.1:29292` (Main Chrome) and `127.0.0.1:29293` (Chrome Dev).
   - Multiplexes commands across browsers (`main`, `dev`, or `any`).
   - Enforces a **monotonic session nonce guard** (`session_nonce`) to reject stale or rogue replay handshakes.
   - Monitors connection health via a 5s heartbeat interval, evicting stale sessions after 15s.

3. **Manifest V3 Chrome Extension (`extension/`)**:
   - Connects *outbound* to the broker via reverse WebSocket (`ws://127.0.0.1:29292` / `29293`).
   - Maintains continuous service worker execution via an offscreen document keepalive (`pages/offscreen_keepalive.html`) and persistent message port.
   - Uses high-privilege extension APIs (`chrome.tabs`, `chrome.scripting`, `chrome.offscreen`) to query active tabs, evaluate DOM scripts, and capture screenshots without stealing visual focus.

---

## Development Setup

### Prerequisites
- **Go**: `1.23+` installed and on your `$PATH`.
- **Node.js**: `v20+` or `v22+` with `npm`.
- **Google Chrome** / **Google Chrome Dev** (macOS or Linux).
- **Git**

### Clone & Build

```bash
# Clone the repository
git clone https://github.com/le-dawg/modcdp-mcp.git
cd modcdp-mcp

# Install JavaScript/TypeScript dependencies
npm install

# Compile the native Go binary
go build -o bin/modcdp-mcp ./cmd/modcdp-mcp/

# Build dual unpacked extensions into ~/.config/modcdp-mcp/extensions/
node scripts/build-extensions.mjs
```

---

## Testing & Quality Assurance

The project contains both Go unit tests and Node.js end-to-end integration tests (28 total tests).

### 1. Running Go Tests
Verify Go broker socket lifecycle, orphan cleanup, and browser state handling:
```bash
go test ./... -v
```

### 2. Running Node Integration Tests
Verify extension bundle integrity, forbidden path linting, harness registration snapshots, and MCP tool dispatch:
```bash
npm test
```

### 💡 Local Test Isolation Note
If you have installed `modcdp-mcp` locally as a macOS `launchd` service (`com.dawgctor.modcdp-broker`), your live Chrome extension is actively connected to port `29292`. Because the integration tests run mock browser instances on ports `29292/29293`, running `npm test` while the production service is active can cause port conflicts.

To run the integration suite in clean isolation locally:
```bash
# 1. Stop the launchd daemon
launchctl bootout gui/$(id -u)/com.dawgctor.modcdp-broker 2>/dev/null || true

# 2. Run the full test suite
npm test

# 3. Restart the background daemon when done
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dawgctor.modcdp-broker.plist 2>/dev/null || true
```
*(In automated CI environments like GitHub Actions, the launchd daemon is not present, so tests execute in clean isolation automatically.)*

---

## Code Style & Conventions

- **Go**:
  - Run `gofmt -s -w .` before committing.
  - Follow standard Go concurrency practices: always protect shared broker slot state with `sync.Mutex` or `sync.RWMutex`.
  - Handle all errors explicitly; avoid silent panics or unchecked errors.

- **TypeScript / JavaScript**:
  - Use modern ES Modules (`.mjs` or ES2022 TypeScript).
  - Adhere to the Manifest V3 security boundaries: do not attempt to execute arbitrary remote scripts or introduce external CDNs.
  - Zero external network dependencies: keep the runtime self-contained on `127.0.0.1`.

---

## Pull Request Guidelines

1. **Branch Naming**: Use feature or bugfix branches (`feat/my-feature`, `fix/issue-description`).
2. **Atomic Commits**: Keep commits focused and provide clear, descriptive commit messages.
3. **Verify Tests**: Ensure all Go tests (`go test ./... -v`) and Node tests (`npm test`) pass.
4. **No Regressions**: Verify that changes do not introduce modal prompts or break MV3 service worker keepalive.
5. **Security Check**: Do not hardcode personal directory paths, tokens, or credentials.

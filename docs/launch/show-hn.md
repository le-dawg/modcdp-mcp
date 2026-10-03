# Show HN: ModCDP-MCP — Zero-modal Chrome automation for AI coding agents

**Title:** Show HN: ModCDP-MCP – Zero-modal Chrome MCP server for Claude Code & Codex

**Link:** https://github.com/le-dawg/modcdp-mcp

**Text:**

Hey HN! I'm sharing **ModCDP-MCP**, an open-source, native Model Context Protocol (MCP) server written in Go that gives AI coding agents (Claude Code, OpenAI Codex, Gemini Antigravity, Copilot, Cursor) direct access to inspect, query, and evaluate code in your live Google Chrome tabs without triggering Chrome's remote debugging modal alerts.

Repository: https://github.com/le-dawg/modcdp-mcp

---

### The Problem: Chrome 136/144+ and the Remote Debugging Modal Crisis

Starting in Chrome 136 (and enforced strictly in 144+), Chromium introduced mandatory runtime user consent for remote debugging connections (`--remote-debugging-port=9222`). The goal was well-intentioned: infostealer malware had been abusing open CDP ports to silently extract session cookies and auth tokens from background browser instances.

However, this change inadvertently crippled local AI coding agents. 

Whenever an autonomous agent loop (like Claude Code running an end-to-end frontend task or Codex executing a verification pass) tries to query the browser over standard CDP, Chrome intercepts the connection and displays a system-level modal alert:
> *"Allow remote debugging for this browser instance?"*

This modal creates severe failure modes for developer agents:
1. **Unattended Loops Hang Indefinitely:** Autonomous coding agents cannot click OS-level Chrome permission prompts. If you step away from your keyboard, the agent loop stalls until timeout.
2. **Re-prompting Fatigue:** Even when clicked, the consent prompt re-triggers periodically or upon reconnects.
3. **Detached Profiles Break Authentication:** The standard workaround—launching Chrome with an ephemeral `--user-data-dir=/tmp/...`—spawns an empty, unauthenticated browser window. The agent loses access to your logged-in session, staging credentials, cookies, and local storage.
4. **Visual Focus Blindness:** Traditional CDP has no native awareness of which window or tab the developer is actively looking at on their screen, frequently reading or screenshotting stale background tabs.

---

### The Solution: Inverting the Connection Topology

Rather than trying to pierce Chrome from the outside with an inbound debugging port, **ModCDP-MCP inverts the architecture**:

1. **Zero Open Debug Ports:** Chrome runs normally without `--remote-debugging-port`.
2. **Outbound Reverse WebSocket:** An unpacked Manifest V3 Chrome extension initiates an *outbound* WebSocket connection to a lightweight local Go broker (`127.0.0.1:29292` for Main Chrome, `127.0.0.1:29293` for Chrome Dev).
3. **Trusted Extension Security Model:** Chromium treats outbound connections from an installed extension to `127.0.0.1` as trusted internal extension traffic. It triggers **zero modal consent dialogs**.
4. **Live Tab Access via Extension APIs:** The extension uses `chrome.tabs`, `chrome.scripting`, and `chrome.offscreen` to interact directly with your live foreground tabs—retaining all cookies, active sessions, and DOM state.
5. **MV3 Service Worker Keepalive:** MV3 service workers shut down after 30 seconds of idle time. ModCDP uses an offscreen document (`pages/offscreen_keepalive.html`) that maintains an active port connection to the service worker, keeping the broker connection alive 24/7.
6. **Session Nonce & Heartbeat Guard:** The Go broker enforces monotonic nonces and heartbeat ping-pongs to immediately evict orphaned or zombie connections when a browser window closes.

---

### System Architecture

```
┌────────────────────────────────────────────────────────┐
│ AI Coding Agent (Claude Code / Codex / Antigravity)    │
└───────────────────────────┬────────────────────────────┘
                            │ Standard stdio (MCP JSON-RPC 2.0)
                            ▼
┌────────────────────────────────────────────────────────┐
│ Native MCP Server CLI (~/.local/bin/modcdp-mcp)        │
└───────────────────────────┬────────────────────────────┘
                            │ Unix Domain Socket IPC (/tmp/modcdp-broker.sock)
                            ▼
┌────────────────────────────────────────────────────────┐
│ Go Broker Daemon (launchd persistent service)          │
│  ├─ Dual-Browser Multiplexer (Main :29292 / Dev :29293)│
│  ├─ Monotonic Session Nonce Guard & Heartbeat Eviction │
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

The system separates the client protocol layer from the browser multiplexer:
- **`modcdp-mcp` (stdio CLI):** A lightweight binary launched on-demand by the AI harness (Claude Code, Claude Desktop, Codex, etc.). It communicates with the harness over standard JSON-RPC 2.0 stdio.
- **Unix Domain Socket IPC:** Fast, secure local communication (`/tmp/modcdp-broker.sock`, mode `0600`) between the CLI process and the daemon.
- **`modcdp-mcp broker` (Daemon):** A persistent background daemon managed by macOS `launchd` that multiplexes connections between Main Chrome and Chrome Dev/Canary.

---

### Exposed MCP Tools

ModCDP-MCP provides 6 high-level tools adhering to the Model Context Protocol (spec 2024-11-05):

1. **`get_active_tab`**: Instantly returns the title, URL, ID, and window of the currently focused tab in the foreground Chrome window.
2. **`find_tabs_by_title`**: High-speed regex or substring search across hundreds of open tabs with optional URL filtering.
3. **`focus_tab`**: Brings a specific tab and its parent window to the visual foreground.
4. **`eval_in_tab`**: Executes JavaScript inside the DOM context of a target tab and returns the serialized result (page elements, window properties, form state).
5. **`modcdp_eval`**: Evaluates JavaScript inside the extension's privileged service worker scope, providing full access to `chrome.*` APIs (`chrome.tabs`, `chrome.cookies`, `chrome.storage`).
6. **`capture_active_tab_screenshot`**: Takes a visual PNG/JPEG screenshot of the active foreground tab without stealing window focus or destroying page state.

---

### Performance & Benchmarks

Compared to traditional Node/Puppeteer or raw CDP wrappers:

| Metric | ModCDP-MCP ⚡ | Traditional CDP (:9222) | Puppeteer / Playwright | Chrome DevTools MCP |
|---|:---:|:---:|:---:|:---:|
| **Zero Modal Prompts** | **Yes (0 alerts)** | No (modal prompts) | No (requires clean profile) | No (modal prompts) |
| **Inspects Live Session** | **Yes (Current cookies/auth)** | Unreliable / resets | No (fresh empty profile) | Isolated instance |
| **Dual-Browser Multiplexing** | **Yes (Main + Dev simultaneously)**| No (single port) | No (single instance) | No (single instance) |
| **Active Foreground Focus** | **Yes (`get_active_tab`)** | Blind to visual focus | No active window concept | Manual tab indexing |
| **Binary / Process Footprint** | **~15MB (Single Go binary)** | Chromium instance | ~300MB (Node + Chromium) | ~150MB (Node.js runtime)|
| **Process Startup Latency** | **< 5ms** | 500ms – 2,000ms | 1,000ms – 3,000ms | 800ms – 2,500ms |
| **Autonomous Loop Resilience**| **100% Non-blocking** | Stalls on user prompt | Stalls on user prompt | Stalls on user prompt |

Because the server is compiled Go with zero external dependencies, stdio cold-boot is practically instantaneous (<5ms), making it ideal for transient agent subshells.

---

### Quickstart (< 60 Seconds)

**Option 1: One-Line Installer**
```bash
curl -fsSL https://raw.githubusercontent.com/le-dawg/modcdp-mcp/main/scripts/install.sh | bash
```

**Option 2: From Source / Node CLI**
```bash
git clone https://github.com/le-dawg/modcdp-mcp.git
cd modcdp-mcp
npm install
npm run onboard
```

The interactive onboarding script:
1. Compiles the Go binary to `~/.local/bin/modcdp-mcp`.
2. Builds the unpacked extensions to `~/.config/modcdp-mcp/extensions/`.
3. Sets up and starts the `launchd` background broker service.
4. Auto-detects and writes transactional MCP configs for:
   - Anthropic Claude Code (`~/.claude.json`)
   - Claude Desktop (`claude_desktop_config.json`)
   - OpenAI Codex CLI (`~/.codex/config.toml`)
   - Google Gemini / Antigravity CLI (`~/.gemini/antigravity-cli/mcp_config.json`)
   - GitHub Copilot (`~/.copilot/mcp-config.json`)
   - Cursor IDE (`~/.cursor/mcp.json`)

Then just load the unpacked extension in Chrome (`chrome://extensions` → Load unpacked → `~/.config/modcdp-mcp/extensions/main`), and your agents immediately have full browser access.

---

### Security & Privacy Considerations

Because ModCDP grants the local AI agent the ability to inspect tabs and evaluate JavaScript, we designed security from the ground up:
- **Localhost Binding Only:** The broker listens strictly on loopback (`127.0.0.1`). No remote network interfaces are bound.
- **Unix Socket Permissions:** IPC socket `/tmp/modcdp-broker.sock` is locked down to user permissions (`0600`).
- **Protected URL Guardrails:** In compliance with Chromium security policies, script execution is barred on sensitive browser internal pages (`chrome://`, `chrome-extension://`, and Chrome Web Store).
- **Session Isolation:** Monotonic session tokens ensure only the currently authorized extension session executes commands.

### Looking Forward

Everything is open source under the MIT License: https://github.com/le-dawg/modcdp-mcp

We'd love your thoughts on:
1. Additional high-level DOM interaction primitives (accessibility tree snapshots, smart click selectors).
2. Cross-platform Linux/Windows broker daemonization experiences.
3. How your agent harnesses are interacting with browser context today.

Happy to answer any questions about MV3 extension internals, Go broker multiplexing, or MCP tooling!

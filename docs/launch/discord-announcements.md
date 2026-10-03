# Developer Discord Announcements

This document contains tailored announcement blurbs for major AI developer and hacker Discord communities.

---

### 1. Anthropic / Claude Developers Discord (`#tools-and-mcp`)

> **⚡ ModCDP-MCP — Zero-modal Chrome automation for Claude Code & Claude Desktop**  
> 
> Hey everyone! If you use **Claude Code CLI** or **Claude Desktop** with browser automation, you've probably hit the recent Chrome 136/144+ security change where standard CDP (`:9222`) spams *"Allow remote debugging?"* modal alerts, breaking unattended agent runs.
> 
> We just released **ModCDP-MCP** — an open-source, native Go MCP server that connects Claude directly to your live Chrome browser tabs with **zero modal prompts**:
> 
> • **Zero Modals**: Inverted architecture uses an outbound reverse WebSocket from an MV3 extension to a local Go broker daemon.
> • **Active Tab Precision (`get_active_tab`)**: Claude automatically knows what tab you are actively looking at on your screen.
> • **Live DOM & Cookies**: Inspects your current authenticated development tabs (`localhost:3000`) without spinning up empty headless sandboxes.
> • **Turnkey Setup**: `npm run onboard` auto-detects Claude Code (`~/.claude.json`) and Claude Desktop with automatic backup rollback.
> 
> 📦 **GitHub**: https://github.com/le-dawg/modcdp-mcp  
> 📜 **License**: MIT | Single Go binary (<15MB RAM)

---

### 2. OpenAI Developers Discord (`#api-and-agents`)

> **⚡ ModCDP-MCP: Zero-Modal Browser Automation for Codex CLI & OpenAI Agents**
> 
> Hey devs! If you're building autonomous browser agents or using OpenAI Codex CLI, Chrome 136/144+ remote debugging consent dialogs have made standard CDP pipelines unreliable for unattended execution.
> 
> **ModCDP-MCP** solves this cleanly with a native Go broker + MV3 reverse WebSocket bridge:
> 
> • **100% Non-Blocking Agent Loops**: Eliminates the "Allow remote debugging" OS modal completely by inverting the connection topology.
> • **Native Codex Integration**: Configures directly into `~/.codex/config.toml` in seconds.
> • **Dual-Browser Multiplexing**: Seamlessly routes commands between Main Chrome (`:29292`) and Chrome Dev (`:29293`).
> • **High-Speed Execution**: Sub-5ms startup latency, DOM JS evaluation (`eval_in_tab`), and screenshot capture (`capture_active_tab_screenshot`).
> 
> 🔗 **Repo**: https://github.com/le-dawg/modcdp-mcp  
> Quick install: `curl -fsSL https://raw.githubusercontent.com/le-dawg/modcdp-mcp/main/scripts/install.sh | bash`

---

### 3. Model Context Protocol (MCP) Official Discord (`#showcase`)

> **⚡ ModCDP-MCP: Native Dual-Browser MCP Server for Chrome & Chrome Dev**
> 
> Excited to share **ModCDP-MCP**, a high-performance native Go implementation of the Model Context Protocol (spec 2024-11-05) for Google Chrome browser automation:
> 
> **Architecture Highlights:**
> • **Bypasses Chrome 136/144+ Modals**: Reverse WebSocket connection from an unpacked MV3 extension to a local Go broker daemon. Zero remote debugging consent dialogs.
> • **Dual-Browser Multiplexer**: Simultaneously controls Main Chrome (port 29292) and Chrome Dev (port 29293).
> • **Protocol Separation**: Lightweight stdio JSON-RPC CLI connects via Unix Domain Socket (`/tmp/modcdp-broker.sock`, 0600) to a persistent macOS `launchd` background broker.
> • **6 Standard MCP Tools**: `get_active_tab`, `find_tabs_by_title`, `focus_tab`, `eval_in_tab`, `modcdp_eval`, `capture_active_tab_screenshot`.
> • **Cross-Harness Support**: Works out of the box with Claude Code, Claude Desktop, OpenAI Codex, Gemini Antigravity, and GitHub Copilot.
> 
> 🔗 **GitHub**: https://github.com/le-dawg/modcdp-mcp  
> Would love your feedback on our tool schemas and architecture!

---

### 4. Latent Space Discord (`#general` / `#projects`)

> **⚡ Hacking Chrome 136/144+ modal restrictions for autonomous AI coding agents (ModCDP-MCP)**
> 
> Hey folks! Quick engineering story: Chrome recently locked down `--remote-debugging-port=9222` to mitigate infostealer malware, adding an OS modal consent dialog on every connection. But this broke autonomous coding loops (Claude Code, Codex, Cursor) whenever agents needed to inspect frontend UI.
> 
> Instead of fighting Chrome's inbound security barriers or spinning up heavyweight detached Puppeteer profiles that lose all login cookies, we inverted the connection topology:
> 
> 1. An unpacked Manifest V3 extension initiates an *outbound* WebSocket connection to a local Go broker daemon on localhost.
> 2. Chromium treats outbound extension traffic as trusted internal extension communication — **zero modal prompts**.
> 3. An offscreen document maintains an internal port to bypass MV3 service worker 30-second idle termination.
> 4. A single compiled Go binary (<15MB RAM, <5ms startup) handles stdio MCP JSON-RPC, multiplexing Main Chrome and Chrome Dev over Unix domain sockets.
> 
> We packaged this as **ModCDP-MCP** under the MIT license with one-command onboarding for Claude, Codex, and Antigravity.
> 
> 🔗 **Read the architecture & code**: https://github.com/le-dawg/modcdp-mcp  
> Would love to hear how you folks are handling live browser context in your agent workflows!

# Reddit Launch Posts

This document contains 3 dedicated, tailored technical launch posts for developer communities on Reddit.

---

## Post 1: r/LocalLLaMA

**Target Subreddit:** `r/LocalLLaMA`  
**Flair:** Project / Tool  
**Title:** Bypassing Chrome 136/144+ remote debugging modals for autonomous local agent loops (Open-source Go broker + MCP)

**Post Content:**

Hey r/LocalLLaMA,

If you run autonomous local agents (via Ollama, vLLM, LM Studio, or local tool-calling frameworks like LangChain/LlamaIndex) that interact with a web browser, you've probably run into Chrome's recent security lockdown in versions 136/144+.

### The Problem for Local Agent Autonomy
When running a local model in a continuous loop to test code or scrape web data, opening standard CDP (`--remote-debugging-port=9222`) triggers an OS modal dialog:
> *"Allow remote debugging for this browser instance?"*

This completely destroys unattended agent runs. Your local agent loop stalls waiting for an OS click. The usual workarounds either require launching heavy detached sandbox browsers (Puppeteer/Playwright eating 300MB+ RAM and VRAM overhead that you'd rather save for model weights) or creating empty temporary profiles where all your login cookies, local development sessions (`localhost:3000`), and saved states are stripped.

### The Solution: ModCDP-MCP
To fix this, we built and open-sourced **ModCDP-MCP** (https://github.com/le-dawg/modcdp-mcp), an MIT-licensed native Go broker and Model Context Protocol (MCP) server.

Instead of opening an inbound port on Chrome:
1. An unpacked Manifest V3 extension makes an *outbound* reverse WebSocket connection to a lightweight local Go broker daemon (`127.0.0.1:29292` / `29293`).
2. Chromium treats outbound extension traffic as trusted internal traffic—**zero modal permission dialogs**.
3. The extension uses native extension APIs (`chrome.tabs`, `chrome.scripting`) to query and interact directly with your existing, authenticated browser tabs.
4. An offscreen document keeps the MV3 service worker alive 24/7.
5. The local agent interacts with the Go binary over standard JSON-RPC (MCP protocol) via `stdio` or Unix domain sockets (`/tmp/modcdp-broker.sock`).

### Why it's great for local agent setups:
- **Tiny footprint:** Single Go binary, <15MB RAM usage (compared to 150MB+ for Node-based MCP servers and 300MB+ for headless browsers).
- **Sub-5ms latency:** Near-instant execution of DOM queries and tab searches.
- **Unattended reliability:** Monotonic nonces and heartbeat monitoring cleanly evict dead sessions without hanging agent loops.
- **Works with live state:** Inspects your actual open tabs with cookies, auth headers, and local storage intact.

Repo & Architecture: https://github.com/le-dawg/modcdp-mcp

Install via curl:
```bash
curl -fsSL https://raw.githubusercontent.com/le-dawg/modcdp-mcp/main/scripts/install.sh | bash
```

Let me know if you run into any issues running this with your local models!

---

## Post 2: r/ClaudeAI

**Target Subreddit:** `r/ClaudeAI`  
**Flair:** Prompt / Workflow / Tool  
**Title:** Connecting Claude Code CLI & Claude Desktop to your live Chrome tabs with zero modal alerts (ModCDP-MCP)

**Post Content:**

Hey r/ClaudeAI,

Anthropic's **Claude Code** CLI has quickly become one of the best terminal coding agents out there. But if you've tried having Claude Code or **Claude Desktop** inspect your web app while you write frontend code, you've likely hit the Chrome 136/144+ remote debugging wall:

Standard CDP connections now trigger a modal dialog: *"Allow remote debugging for this browser instance?"* every time Claude tries to inspect the browser. If you're running Claude Code in autonomous or multi-step mode, it hangs waiting for you to find the Chrome window and click "Allow".

We built **ModCDP-MCP** (https://github.com/le-dawg/modcdp-mcp) to permanently eliminate this friction.

### What it does:
ModCDP-MCP connects Claude Code and Claude Desktop directly to your live Chrome browser using an unpacked Manifest V3 extension paired with a native Go broker daemon:

- **Zero modal alerts:** By using an outbound reverse WebSocket from the extension into a local Go broker, Chrome never prompts for remote debugging consent.
- **Active tab precision (`get_active_tab`):** Claude immediately knows which tab you are visually looking at. When you ask *"Claude, why is this button misaligned?"*, it inspects the exact foreground tab without needing a URL.
- **Full DOM evaluation (`eval_in_tab`):** Claude can inspect live DOM trees, read runtime console errors, and evaluate JavaScript in your current authenticated session.
- **Instant screenshots (`capture_active_tab_screenshot`):** Claude can visually verify rendered layouts without stealing focus.
- **Dual-browser support:** Seamlessly multiplexes between your Main Chrome and Chrome Dev/Canary.

### How to set it up:

1. Install and onboard:
```bash
git clone https://github.com/le-dawg/modcdp-mcp.git
cd modcdp-mcp
npm install
npm run onboard
```
*(The onboarding script automatically detects Claude Code and Claude Desktop and writes the MCP configuration with automatic backup rollback).*

2. Or manually add to your `~/.claude.json` (Claude Code) or `claude_desktop_config.json` (Claude Desktop):
```json
{
  "mcpServers": {
    "modcdp": {
      "command": "/Users/YOUR_USER/.local/bin/modcdp-mcp",
      "args": [],
      "env": {}
    }
  }
}
```

3. In Chrome, go to `chrome://extensions`, enable Developer Mode, click **Load unpacked**, and select `~/.config/modcdp-mcp/extensions/main`.

From then on, whenever you ask Claude Code to check your browser, it executes smoothly in the background without any modal popups.

GitHub: https://github.com/le-dawg/modcdp-mcp  
MIT licensed. Feedback and PRs are very welcome!

---

## Post 3: r/OpenAI

**Target Subreddit:** `r/OpenAI`  
**Flair:** Developers / AI Agents  
**Title:** Zero-modal Chrome automation for OpenAI Codex CLI and agentic browser workflows (ModCDP-MCP)

**Post Content:**

Hey r/OpenAI,

With OpenAI Codex CLI, function calling, and agentic workflows increasingly taking over coding tasks, giving agents the ability to verify frontend UI and interact with web applications has become essential.

However, in Chrome 136/144+, Google locked down standard Chrome DevTools Protocol (`--remote-debugging-port=9222`) behind an intrusive system confirmation dialog: *"Allow remote debugging for this browser instance?"*.

For autonomous OpenAI agents running multi-turn loops, this prompt causes severe breakdowns:
- Autonomous agent executions stall indefinitely when the developer isn't actively watching the screen.
- Headless sandboxes (Puppeteer/Playwright) lose all logged-in authentication, cookies, and local development context.
- Agents struggle to target the visually active foreground tab.

### The Fix: ModCDP-MCP
We just released **ModCDP-MCP** (https://github.com/le-dawg/modcdp-mcp), an open-source, high-performance native Go MCP server that gives Codex and OpenAI agents full access to your live Chrome tabs with **zero modal prompts**.

### How it works:
- **Inverted Connection Architecture:** An unpacked MV3 Chrome extension initiates an outbound WebSocket connection to a background Go daemon (`127.0.0.1:29292`). Chromium's security sandbox permits outbound extension traffic without triggering remote debugging consent alerts.
- **Active Tab Targeting:** Exposes `get_active_tab`, allowing your agent to dynamically grab whatever tab you currently have focused on your screen.
- **Fast Execution Context:** Exposes `eval_in_tab` (evaluates JS in the tab's DOM) and `modcdp_eval` (evaluates in extension scope with full `chrome.*` API access).
- **Codex Native Support:** Configures into `~/.codex/config.toml` in one step via interactive onboarding or manual config:

```toml
[mcp_servers.modcdp]
command = "/Users/YOUR_USER/.local/bin/modcdp-mcp"
args = []
enabled = true
```

- **Dual-Browser Multiplexing:** Supports Main Chrome and Chrome Dev concurrently, ideal for testing across stable and cutting-edge browser builds.

The daemon runs persistently via macOS `launchd`, using under 15MB of RAM with sub-5ms cold startup times.

Check out the code, architecture diagrams, and release binaries here:  
https://github.com/le-dawg/modcdp-mcp

Happy to hear thoughts from anyone building agent loops with Codex and MCP!

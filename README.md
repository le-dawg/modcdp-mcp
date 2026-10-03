# ModCDP-MCP ⚡

[![CI](https://github.com/le-dawg/modcdp-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/le-dawg/modcdp-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Go Version](https://img.shields.io/badge/Go-1.23%2B-blue.svg)](https://golang.org)
[![MCP Protocol](https://img.shields.io/badge/MCP-2024--11--05-green.svg)](https://modelcontextprotocol.io)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux-lightgrey.svg)]()

> **Native Dual-Browser Model Context Protocol (MCP) Server for Google Chrome & Chrome Dev.**  
> Bypass Chrome 136/144+ remote debugging consent dialogs with zero modal fatigue, instant foreground tab targeting, and full DOM/extension execution across all AI coding harnesses.

---

## 🎯 The Problem Solved

Starting in **Google Chrome 136/144+**, traditional Chrome DevTools Protocol (CDP) connections via `--remote-debugging-port=9222` trigger intrusive modal consent alerts (*"Allow remote debugging for this browser instance?"*) every few minutes. This completely breaks autonomous AI agent workflows (Claude Code, OpenAI Codex, Gemini Antigravity, GitHub Copilot), forces detached empty profiles, or blinds the agent to what tab the user is actually viewing.

**ModCDP-MCP** solves this fundamentally by reversing the connection topology:

```
┌──────────────────────────────────────────────────────────────┐
│  AI Coding Harnesses (Claude Code / Codex / Antigravity)     │
└──────────────────────────────┬───────────────────────────────┘
                               │  stdio (MCP JSON-RPC)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  modcdp-mcp Binary & Go Broker (/tmp/modcdp-broker.sock)    │
└──────────────┬───────────────────────────────┬───────────────┘
               │ ws://127.0.0.1:29292          │ ws://127.0.0.1:29293
               ▼                               ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│ Main Chrome MV3 Extension    │ │ Chrome Dev MV3 Extension    │
│ (Active Foreground Tabs)     │ │ (Experimental / Canary Tabs)│
└──────────────────────────────┘ └─────────────────────────────┘
```

- 🛡️ **Zero Modal Fatigue**: Interacts with live production Chrome without popping any remote debugging consent alerts.
- 👁️ **Active Tab Precision**: Query the tab the user is visually focused on (`get_active_tab`), solving the blind agent problem.
- 🔀 **Dual-Browser Multiplexing**: Target **Main Chrome** (`:29292`), **Chrome Dev** (`:29293`), or whichever browser is active (`browser: "any"`).
- 🔍 **Global Tab Search**: Find tabs matching regex or title keywords across 300+ open tabs (`find_tabs_by_title`).
- ⚡ **High-Privilege Execution**: Run scripts inside tab DOMs (`eval_in_tab`) or with full `chrome.*` extension privileges (`modcdp_eval`).
- 📸 **Non-Destructive Screenshots**: Capture visual viewport buffers without stealing window focus.

---

## 🚀 60-Second Quickstart

### 1. Run Interactive Onboarding
```bash
git clone https://github.com/le-dawg/modcdp-mcp.git
cd modcdp-mcp
npm install
node scripts/onboarding.mjs
```

The interactive script automatically:
1. Compiles the native binary to `~/.local/bin/modcdp-mcp`.
2. Builds the dual unpacked extensions in `~/.config/modcdp-mcp/extensions/`.
3. Starts the background broker daemon via macOS `launchd`.
4. Registers the MCP server across your installed AI agent CLIs.

### 2. Load Unpacked Extensions
1. Open **Google Chrome** & navigate to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select:
   - `~/.config/modcdp-mcp/extensions/main` (Main Chrome)
   - `~/.config/modcdp-mcp/extensions/dev` (Chrome Dev, optional)

---

## 🛠️ MCP Tools Reference

| Tool | Description | Parameters |
|---|---|---|
| `get_active_tab` | Get user's currently focused browser tab in the active Chrome window. | `browser` (`"main"`, `"dev"`, `"any"`) |
| `find_tabs_by_title` | Search open tabs across all windows by regex or title substring. | `title_pattern` *(required)*, `url_pattern`, `browser` |
| `focus_tab` | Bring a specific browser tab and its parent window to foreground. | `tab_id` *(required)*, `browser` |
| `eval_in_tab` | Evaluate JavaScript directly in the DOM execution context of a tab. | `tab_id` *(required)*, `expression` *(required)*, `browser` |
| `modcdp_eval` | Evaluate JS in service worker context with full `chrome.*` APIs. | `expression` *(required)*, `browser` |
| `capture_active_tab_screenshot` | Capture visual screenshot of active tab without losing focus. | `tab_id`, `format` (`"png"`, `"jpeg"`), `browser` |

---

## ⚙️ AI Harness Configuration

The setup script automatically registers `modcdp-mcp` across your harnesses:

<details>
<summary><b>Anthropic Claude Code (`~/.claude.json`)</b></summary>

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
</details>

<details>
<summary><b>Google Gemini / Antigravity CLI (`~/.gemini/antigravity-cli/mcp_config.json`)</b></summary>

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
</details>

<details>
<summary><b>OpenAI Codex (`~/.codex/config.toml`)</b></summary>

```toml
[mcp_servers.modcdp]
command = "/Users/YOUR_USER/.local/bin/modcdp-mcp"
args = []
enabled = true
```
</details>

<details>
<summary><b>Claude Desktop (`claude_desktop_config.json`)</b></summary>

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
</details>

---

## 📊 Comparison Matrix

| Feature | ModCDP-MCP | Standard CDP (`:9222`) | Puppeteer / Playwright |
|---|:---:|:---:|:---:|
| **Zero Modal Prompts** | ✅ **Yes** | ❌ Spams prompts | ❌ Requires separate profile |
| **Inspects User's Live Session** | ✅ **Yes** | ⚠️ Can break auth | ❌ Detached empty profile |
| **Dual Browser Support (Main/Dev)** | ✅ **Yes** | ❌ Single port | ❌ Single instance |
| **Active Foreground Tab Focus** | ✅ **Yes** | ❌ Blind to focus | ❌ No active window concept |
| **MCP Native (Stdio JSON-RPC)** | ✅ **Yes** | ❌ Needs wrapper | ❌ Needs wrapper |

---

## 🧪 Testing

```bash
# Run Go broker & protocol test suite (5 tests)
go test ./... -v

# Run full Node integration & build test suite (23 tests)
npm test
```

---

## 📄 License

MIT © [le-dawg](https://github.com/le-dawg)

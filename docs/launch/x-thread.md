# Viral X (Twitter) Launch Thread

### Tweet 1 (The Problem Hook + Demo)
Chrome 136/144+ quietly broke local AI coding agents.

Any connection to standard CDP (`--remote-debugging-port=9222`) now triggers an intrusive modal alert ("Allow remote debugging?") every few minutes.

Unattended agent loops stall. Developer flow destroyed.

Introducing **ModCDP-MCP**: zero-modal Chrome automation for AI agents. ⚡

🧵👇 [Demo Video / GIF: Claude Code inspecting live Chrome tab with zero popups]

---

### Tweet 2 (The Inverted Architecture)
How does ModCDP bypass the modal alerts?

By inverting the connection topology:

Instead of an external process opening an inbound debug port into Chrome, an unpacked Manifest V3 extension initiates an *outbound* reverse WebSocket to a native Go broker on localhost.

Chrome treats it as trusted extension traffic.

Result:
✅ Zero consent modals
✅ Live session cookies & auth preserved
✅ Zero disconnected sandbox windows

---

### Tweet 3 (Dual-Browser Multiplexing & Active Tab Precision)
Traditional browser MCP servers are blind to what you're actually looking at.

ModCDP-MCP solves this with foreground intelligence:

🎯 `get_active_tab`: Targets the exact tab you have in focus
🔍 `find_tabs_by_title`: Regex search across 300+ open tabs
⚡ Dual-browser routing: Main Chrome (`:29292`) & Chrome Dev (`:29293`) concurrently
📸 High-res screenshots + DOM evaluation in <5ms

---

### Tweet 4 (Turnkey Multi-Harness Setup)
Setup takes under 60 seconds across all your AI agent tools:

`node scripts/onboarding.mjs`
(or `npm run onboard`)

One interactive CLI auto-configures:
• Anthropic Claude Code & Desktop
• OpenAI Codex CLI
• Google Gemini / Antigravity CLI
• GitHub Copilot & Cursor

Plus it wires up a persistent macOS `launchd` daemon so it's always ready.

---

### Tweet 5 (Open Source & Call to Action)
ModCDP-MCP is 100% open source under the MIT License.

Built with a fast, dependency-free Go broker daemon (<15MB RAM) and Manifest V3.

⭐ Star the repo on GitHub:
https://github.com/le-dawg/modcdp-mcp

Try the one-line install:
`curl -fsSL https://raw.githubusercontent.com/le-dawg/modcdp-mcp/main/scripts/install.sh | bash`

RT if you build with AI agents! What features should we add next? 🚀

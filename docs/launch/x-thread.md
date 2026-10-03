# Viral X (Twitter) Launch Thread

### Tweet 1 (Hook + Video/GIF Demo)
Chrome 136/144+ broke local AI coding agents. 

Connecting over standard CDP now spams modal alerts ("Allow remote debugging?") every 5 minutes, breaking Claude Code and Codex in autonomous mode.

We built ModCDP-MCP: a native zero-modal dual-browser MCP server for Chrome. ⚡

🧵👇 [Demo Video / GIF]

---

### Tweet 2 (The Architecture)
How does it bypass the modal alerts?

Instead of opening an inbound port on Chrome (`:9222`), an unpacked MV3 extension connects *outbound* via reverse WebSocket to a native Go broker on localhost.

Zero consent modals. Zero broken sessions. Instant pair-programming with your live tabs.

---

### Tweet 3 (Dual-Browser + Active Tab Targeting)
Most browser MCP servers are blind to what you're actually looking at.

ModCDP-MCP introduces:
• `get_active_tab`: Targets the exact tab you're focused on
• `find_tabs_by_title`: Instant regex search across 300+ tabs
• Dual-slot routing: Main Chrome (`:29292`) & Chrome Dev (`:29293`) simultaneously

---

### Tweet 4 (Turnkey Multi-Harness Support)
One command configures all your AI coding tools:

`node scripts/onboarding.mjs`

Automatically sets up:
✅ Anthropic Claude Code & Desktop
✅ OpenAI Codex CLI
✅ Google Gemini / Antigravity CLI
✅ GitHub Copilot

---

### Tweet 5 (Call to Action)
100% open source under MIT. Single Go binary, zero external dependencies, persistent macOS launchd support.

⭐ Star on GitHub: https://github.com/le-dawg/modcdp-mcp

RTs appreciated! What features do you want to see next?

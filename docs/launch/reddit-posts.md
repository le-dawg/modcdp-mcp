# Reddit Launch Posts

## Post 1: r/LocalLLaMA & r/ClaudeAI

**Title:** Bypassing Chrome 136/144+ remote debugging modals for Claude Code & Codex (Open-Source ModCDP-MCP)

**Content:**
If you've tried using Claude Code, OpenAI Codex, or local agents to inspect or automate your live browser on macOS, you've probably noticed that Chrome 136/144+ has made standard CDP debugging (`--remote-debugging-port=9222`) virtually unusable. The intrusive "Allow remote debugging" modal pops up repeatedly and breaks unattended agent loops.

We just open-sourced **ModCDP-MCP** (https://github.com/le-dawg/modcdp-mcp), an MIT-licensed native Go broker and Model Context Protocol (MCP) server.

### Key highlights:
- **Zero Modal Alerts**: Communicates via an extension service worker reverse WebSocket proxy.
- **Inspects Your Live Active Tabs**: No need to spin up detached, unauthenticated Puppeteer instances; your agent can read, search, and evaluate JavaScript in your current work tabs.
- **Dual-Browser Support**: Multiplexes Main Chrome (port 29292) and Chrome Dev (port 29293) simultaneously.
- **Native MCP Tools**: Exposes `get_active_tab`, `find_tabs_by_title`, `focus_tab`, `modcdp_eval`, `eval_in_tab`, and `capture_active_tab_screenshot`.
- **Turnkey Setup**: Includes an interactive onboarding script that registers with Claude Code, Codex, Antigravity, and Copilot.

Check out the repo and architecture diagrams here: https://github.com/le-dawg/modcdp-mcp
Feedback and PRs welcome!

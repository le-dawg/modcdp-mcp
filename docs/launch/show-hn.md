# Show HN: ModCDP-MCP — Zero-modal Chrome automation for AI coding agents

**Title:** Show HN: ModCDP-MCP – Zero-modal Chrome MCP server for Claude Code & Codex

**Link:** https://github.com/le-dawg/modcdp-mcp

**Text:**
Hey HN! If you've been using AI coding agents (Claude Code, OpenAI Codex, Gemini Antigravity, GitHub Copilot) alongside Google Chrome, you've likely hit the Chrome 136/144+ remote debugging modal crisis:

Whenever an agent attempts to connect over standard CDP (`--remote-debugging-port=9222`), Chrome pops an intrusive modal alert ("Allow remote debugging for this browser instance?") every few minutes, breaking autonomous runs and destroying flow. Traditional Puppeteer/Playwright alternatives are equally frustrating because they spawn empty detached profiles rather than inspecting the live tab you are actively working in.

We built **ModCDP-MCP** to solve this permanently.

### How it works:
Instead of opening an inbound debugging port into Chrome, ModCDP uses an extension service worker reverse proxy. When Chrome starts, a lightweight unpacked MV3 extension initiates an outbound WebSocket connection to a local Go broker daemon (`127.0.0.1:29292` / `29293`). 

The native Go binary embeds:
1. **Dual-Browser Multiplexing**: Seamlessly route commands to Main Chrome, Chrome Dev, or whichever window is visually focused.
2. **Session Nonce & Heartbeat Guards**: Enforces monotonic nonces and heartbeat monitoring to evict stale sessions cleanly.
3. **Native Model Context Protocol (MCP 2024-11-05)**: Exposes 6 high-level agent tools (`get_active_tab`, `find_tabs_by_title`, `focus_tab`, `modcdp_eval`, `eval_in_tab`, `capture_active_tab_screenshot`).
4. **Zero Background Residue**: Runs as a persistent macOS `launchd` daemon, with transactional multi-harness registration across Claude Code, Codex, Antigravity, and Copilot.

Code, architecture diagrams, and interactive onboarding are open source: https://github.com/le-dawg/modcdp-mcp

Would love to hear feedback and answer questions about the architecture!

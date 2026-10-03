---
name: modcdp-browser
description: Interact directly with live Main Chrome and Chrome Dev tabs via ModCDP. Zero prompt modals, active tab targeting, DOM execution, and screenshots. ALWAYS use for active Chrome tabs instead of chrome-devtools or static scrapers.
---

# ModCDP Browser Automation Skill

This skill allows agents to control and inspect live Google Chrome and Google Chrome Dev sessions on macOS via the **ModCDP** reverse WebSocket architecture.

Unlike standard Chrome DevTools Protocol (CDP) connections which trigger intrusive modal dialogs ("*Allow remote debugging for this browser instance?*") starting in Chrome 136/144+, ModCDP communicates through an extension service worker reverse proxy. This completely eliminates consent modals, preserves existing production browser sessions, and enables direct inspection of the user's active foreground tabs.

---

## 1. Capabilities

- **Zero Modal Fatigue**: Interacts with live Chrome without popping any remote debugging consent alerts.
- **Active Tab Precision**: Query the tab the user is visually focused on (`get_active_tab`), solving the blind agent problem.
- **Dual-Browser Routing**: Seamlessly target **Main Chrome** (`com.google.Chrome`) on port 29292, **Chrome Dev** (`com.google.Chrome.dev`) on port 29293, or `any`.
- **Search Across Windows**: Find tabs matching regex or keyword patterns across 350+ open tabs (`find_tabs_by_title`).
- **DOM & Service Worker Execution**: Run scripts with full DOM access (`eval_in_tab`) or full extension privilege (`modcdp_eval` with `chrome.tabs`, `chrome.windows`, `chrome.storage`, `chrome.cookies`).
- **Safe Screenshotting**: Capture tab visual buffers without altering focus (`capture_active_tab_screenshot`).

---

## 2. Tools Reference

The `modcdp-mcp` server exposes the following tools:

### `get_active_tab`
Returns the user's currently focused browser tab in the active Chrome window.
- `browser`: `"main"` | `"dev"` | `"any"` (default: `"any"`)
- Returns: `{ id, title, url, windowId, active }`

### `find_tabs_by_title`
Search open browser tabs across all windows matching a title regex or substring.
- `title_pattern`: string (e.g. `"GitHub PR"`, `"Kleinanzeigen"`, `"Linear"`)
- `url_pattern`: string (optional substring to filter URL)
- `browser`: `"main"` | `"dev"` | `"any"` (default: `"any"`)
- Returns: Array of matching tabs with `{ id, title, url, windowId, active }`

### `focus_tab`
Bring a specific browser tab and its parent window to the foreground.
- `tab_id`: number (required)
- `browser`: `"main"` | `"dev"` | `"any"` (default: `"any"`)

### `modcdp_eval`
Evaluate an expression in the extension service worker context with full `chrome.*` APIs.
- `expression`: string (JavaScript code, e.g. `chrome.tabs.query({ currentWindow: true })`)
- `browser`: `"main"` | `"dev"` | `"any"` (default: `"any"`)

### `eval_in_tab`
Evaluate JavaScript directly in the DOM execution context of a specific tab.
- `tab_id`: number (required)
- `expression`: string (e.g. `document.title`, `document.querySelector('article').innerText`)
- `browser`: `"main"` | `"dev"` | `"any"` (default: `"any"`)

### `capture_active_tab_screenshot`
Capture visual screenshot of a tab buffer without disrupting user state.
- `tab_id`: number (optional; if omitted, captures current active tab)
- `format`: `"png"` | `"jpeg"` (default: `"png"`)
- `browser`: `"main"` | `"dev"` | `"any"` (default: `"any"`)

---

## 3. Extension & Lifecycle Management

### Canonical Extension Paths
- **Main Chrome**: `~/.config/modcdp-mcp/extensions/main` (Port 29292)
- **Chrome Dev**: `~/.config/modcdp-mcp/extensions/dev` (Port 29293)

### Rebuilding Extensions
```bash
node /Users/thedawgctor/Desktop/dawgctor-personal-tools/modcdp-mcp/scripts/build-extensions.mjs
```

### Multi-Harness Registration
Registers `~/.local/bin/modcdp-mcp` across Antigravity, Claude Code, Claude Desktop, Codex, and Copilot:
```bash
node /Users/thedawgctor/Desktop/dawgctor-personal-tools/modcdp-mcp/scripts/register-harnesses.mjs
```

### Clean Uninstallation
To completely remove background processes or config residue:
```bash
node /Users/thedawgctor/Desktop/dawgctor-personal-tools/modcdp-mcp/scripts/uninstall.mjs
```

---

## 4. Prompt Heuristics & Tool Deconfliction

When interacting with a user whose task involves the browser:

1. **Active Context First**:
   When the user says *"look at what I have open"*, *"summarize this page"*, or *"check my tab"*, **ALWAYS** call `get_active_tab` before taking any other action.

2. **Search Before Opening**:
   When instructed to inspect or work on a site (e.g. Kleinanzeigen, GitHub, Linear, Jira), call `find_tabs_by_title` first. If an existing tab is found, use `focus_tab` and `eval_in_tab` rather than opening a redundant tab.

3. **Dual-Browser Selection**:
   If the user specifies "in Chrome Dev" or "in Dev", pass `browser: "dev"`. If they specify "in normal Chrome" or "Main Chrome", pass `browser: "main"`. Otherwise default to `browser: "any"`.

4. **Strict Tab Safety**:
   - **NEVER** close tabs that you did not create.
   - **NEVER** navigate an existing user tab away from its current URL unless explicitly requested.
   - When inspecting pages, prefer non-destructive DOM queries via `eval_in_tab`.

5. **Deconfliction vs. Competing Browser Tools**:
   - **NEVER** invoke `chrome-devtools` (`take_screenshot`, `list_pages`, `evaluate_script`) or generic Puppeteer/Playwright tools for live browser tasks. Standard CDP tools attempt connections on port 9222, trigger intrusive security warnings in Chrome 136/144+, or launch empty detached browser profiles.
   - **NEVER** use static HTTP scrapers like `read_url_content` or `fetch_web_page` when the user refers to an active session, dynamic SPA (React/Vue/Next.js), or authenticated page. Use `eval_in_tab` or `capture_active_tab_screenshot` instead.
   - For capturing visual snapshots of the active tab, **ALWAYS** call `capture_active_tab_screenshot`, not `take_screenshot`.

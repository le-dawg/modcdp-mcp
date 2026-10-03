# Project: modcdp-mcp

## Architecture
`modcdp-mcp` is a native Model Context Protocol (MCP) server written in Go with an unpacked Google Chrome extension bridge (Manifest V3) that eliminates the remote debugging consent modal ("Allow remote debugging for this browser instance?") introduced in Chrome 136/144+.

### Core Data Flow
1. **AI Agent Harnesses** (Claude Code, Claude Desktop, OpenAI Codex CLI, Gemini Antigravity, GitHub Copilot) communicate with the `modcdp-mcp` binary over standard `stdio` using MCP JSON-RPC 2.0.
2. The `modcdp-mcp` binary forwards commands via local Unix Domain Socket IPC (`/tmp/modcdp-broker.sock`) to a background Go broker daemon (`modcdp-mcp broker`).
3. Google Chrome (Main on `127.0.0.1:29292`, Dev/Canary on `127.0.0.1:29293`) runs an unpacked Manifest V3 extension. The extension initiates an **outbound reverse WebSocket** connection into the Go broker.
4. Because the connection is outbound from an extension to localhost, Chrome treats it as internal extension traffic—triggering zero security consent prompts.
5. High-privilege extension APIs (`chrome.tabs`, `chrome.scripting`, `chrome.offscreen`) execute tab queries, script evaluations, and screenshot captures directly on the user's active foreground tabs.
6. The service worker is kept alive 24/7 via an offscreen keepalive document (`pages/offscreen_keepalive.html`) and an internal port connection.

```
┌────────────────────────────────────────────────────────┐
│ AI Coding Agent (Claude Code / Codex / Antigravity)    │
└───────────────────────────┬────────────────────────────┘
                            │ Standard stdio (JSON-RPC 2.0)
                            ▼
┌────────────────────────────────────────────────────────┐
│ Native MCP Server CLI (bin/modcdp-mcp)                 │
└───────────────────────────┬────────────────────────────┘
                            │ Unix Domain Socket IPC (/tmp/modcdp-broker.sock)
                            ▼
┌────────────────────────────────────────────────────────┐
│ Go Broker Daemon (launchd persistent service)          │
│  ├─ Dual-Browser Multiplexer (Main :29292 / Dev :29293)│
│  ├─ Session Nonce Guard & Heartbeat Eviction           │
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

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Community Health Standards | Contributor Covenant v2.1 Code of Conduct | M1 | R1, R2, Survey |
| 2 | Security Disclosure SLA & Email | Vulnerability reporting email and security policy | M1 | R1, R2, Survey |
| 3 | S-Tier README & Documentation | Badges, Mermaid + ASCII architecture, quickstart, comparison table, tool schemas, FAQ | M1 | R1, R2, Survey |
| 4 | Onboarding Script Alignment | Align `npm run onboard` to `scripts/onboard.mjs` and update references | M1 | R1, Survey |
| 5 | Version String Alignment | Harmonize MCP `serverInfo.version` to `"0.2.0"` in Go source | M1 | Survey |
| 6 | Repository Cleanliness & .gitignore | Ignore build binaries, `dist/`, test artifacts, OS files, and teamwork metadata | M2 | R1, R2, Survey |
| 7 | CI Workflow Fix (.github/workflows/ci.yml) | Compile Go binary before `npm test`, export to `~/.local/bin`, add multi-OS matrix | M2 | R1, R2, Survey |
| 8 | Release Workflow Hardening (release.yml) | Multi-arch builds (macOS arm64/amd64, Linux amd64/arm64), checksums.txt, dynamic tag archive | M2 | R1, R2, Survey |
| 9 | Plist Template Fix | Remove hardcoded developer path from `com.dawgctor.modcdp-broker.plist` | M2 | Survey |
| 10 | One-Line Installer (`scripts/install.sh`) | Shell script for curl-based release binary and extension installation | M3 | R1, Survey |
| 11 | Packaging & Uninstallation Polish | Add `"bin"` field in package.json, clean uninstaller launchd unloading | M3 | R1, Survey |
| 12 | Test Suite Verification (28/28 tests) | 5 Go tests + 23 Node tests passing with zero regressions | M4 | R2, Survey |
| 13 | Public GitHub Repository Publication | Synchronize repo topics, description, push `main`, re-tag `v0.2.0`, create GitHub Release | M5 | R3, Survey |
| 14 | Launch Collateral Package | Production-grade Show HN, X Thread, Reddit posts, Discord announcements in `docs/launch/` | M6 | R4, Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Community, Licensing & Docs Overhaul | `CODE_OF_CONDUCT.md`, `SECURITY.md`, `README.md`, `CONTRIBUTING.md`, `internal/mcp/server.go` version fix | None | DONE |
| 2 | Codebase Hygiene & CI/CD Hardening | `.gitignore`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, plist template | None | DONE |
| 3 | Installation & Packaging Experience | `scripts/install.sh`, `package.json`, `scripts/uninstall.mjs`, onboarding cleanup | M1, M2 | DONE |
| 4 | Test Suite Verification | Verify 28/28 tests pass (`go test ./...` and `npm test`) | M2, M3 | DONE |
| 5 | Public GitHub Publication | Push `main`, update tag `v0.2.0`, create GitHub Release with binaries | M1, M2, M3, M4 | IN_PROGRESS |
| 6 | Launch & Marketing Execution | Complete all 4 launch files under `docs/launch/` | M5 | DONE |

## Code Layout
- `cmd/modcdp-mcp/`: CLI entry point for stdio MCP server and background broker daemon.
- `internal/broker/`: High-performance Go broker, WebSocket listeners (29292, 29293), Unix socket IPC, session nonce guard.
- `internal/mcp/`: MCP protocol server implementation, tool definitions, execution dispatch.
- `extension/`: Manifest V3 Chrome extension source (TypeScript), service worker, keepalive offscreen document.
- `scripts/`: Onboarding CLI (`onboard.mjs`), installer (`install.sh`), build scripts (`build-extensions.mjs`), LaunchAgent plists.
- `tests/`: End-to-end integration test suites (Node.js test runner).
- `docs/launch/`: FOSS launch marketing package (Hacker News, X/Twitter, Reddit, Discord).
- `.github/workflows/`: CI automated test workflows (`ci.yml`) and multi-platform release workflows (`release.yml`).

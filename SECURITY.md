# Security Policy

`modcdp-mcp` is designed from the ground up for secure, local-only developer automation. We take the security and integrity of user environments seriously.

---

## Supported Versions

Only the latest active minor release receives security updates and patches:

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2.0 | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability or potential threat in `modcdp-mcp`, please **do not** disclose it publicly via GitHub Issues, public pull requests, or discussion boards.

Instead, report it through one of the following private channels:

1. **Email**: Send vulnerability details to [security@0xdawg.com](mailto:security@0xdawg.com).
2. **GitHub Security Advisory**: Submit a confidential report via [GitHub Private Vulnerability Reporting](https://github.com/le-dawg/modcdp-mcp/security/advisories/new).

### Vulnerability Disclosure SLA
- **Initial Response**: Within **48 hours** of report receipt, a maintainer will acknowledge and provide an initial assessment.
- **Triage & Status Updates**: Status updates will be provided every 72 hours during active triage.
- **Remediation Target**: Verified vulnerabilities will be patched and a security release issued within **14 days** of confirmation.
- **Public Disclosure**: Coordinated public disclosure occurs only after an advisory and patched release are published.

---

## Threat Model & Architecture Security

`modcdp-mcp` bridges native AI agent harnesses (Claude Code, OpenAI Codex, Gemini Antigravity) to Google Chrome. The system operates under a strict local-first security model:

### 1. Local Loopback Isolation
- The background Go broker listens exclusively on the loopback interface (`127.0.0.1:29292` and `127.0.0.1:29293`).
- Network listeners do **not** bind to `0.0.0.0` or external network interfaces, preventing remote network access.

### 2. Unix Domain Socket Permissions
- Communication between the MCP CLI tool (`bin/modcdp-mcp`) and the broker daemon occurs via a Unix domain socket at `/tmp/modcdp-broker.sock`.
- The socket is created with strict user-only permissions (`0600`), preventing access by other local non-root users on the system.

### 3. Inverted WebSocket Topology (Zero Open Debug Ports)
- Unlike traditional Chrome DevTools Protocol (CDP) which requires Chrome to open an inbound `--remote-debugging-port=9222` listener exposed to the network, `modcdp-mcp` does **not** launch or configure Chrome with open debugging ports.
- The unpacked Manifest V3 extension initiates an *outbound* reverse WebSocket connection into the local broker. Chrome treats this as internal extension communication, preventing port-scanning or cross-site WebSocket hijacking attacks.

### 4. Monotonic Session Nonce Guard
- Every extension handshake requires a cryptographically unique or strictly increasing `session_nonce`.
- The broker validates nonces to prevent stale session reuse, replay attacks, or unauthorized connection hijacking.
- Active sessions inactive for more than 15 seconds are evicted via heartbeat timeout.

### 5. Zero Cloud Telemetry & Data Privacy
- `modcdp-mcp` contains **zero external network calls**, zero crash reporters, and zero tracking or analytics telemetry.
- All DOM queries, tab metadata, script evaluations, and screenshots remain strictly on your local machine.

### 6. Chrome Extension Sandbox Boundaries
- Scripts evaluated in tab DOMs (`eval_in_tab`) are bounded by standard Chrome extension permissions (`chrome.scripting`).
- Extension execution cannot bypass Chrome's built-in sandbox restrictions on sensitive system URLs (`chrome://`, `chrome-extension://`, and Chrome Web Store pages).

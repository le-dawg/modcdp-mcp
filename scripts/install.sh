#!/usr/bin/env bash
# scripts/install.sh — Standalone installer for ModCDP MCP Server
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/le-dawg/modcdp-mcp/main/scripts/install.sh | bash
set -euo pipefail

# Terminal colors
if [ -t 1 ]; then
  BOLD="\033[1m"
  GREEN="\033[0;32m"
  CYAN="\033[0;36m"
  YELLOW="\033[1;33m"
  RED="\033[0;31m"
  RESET="\033[0m"
else
  BOLD=""
  GREEN=""
  CYAN=""
  YELLOW=""
  RED=""
  RESET=""
fi

printf "\n%b" "${CYAN}${BOLD}"
printf "╔════════════════════════════════════════════════════════════════════╗\n"
printf "║               ⚡ ModCDP Native Dual-Browser MCP Server             ║\n"
printf "║                 Zero-Modal CDP Automation Installer                ║\n"
printf "╚════════════════════════════════════════════════════════════════════╝\n"
printf "%b\n" "${RESET}"

# 1. Detect Operating System
OS_NAME="$(uname -s)"
case "$OS_NAME" in
  Darwin|darwin)
    OS="darwin"
    ;;
  Linux|linux)
    OS="linux"
    ;;
  *)
    printf "%bError: Unsupported operating system '%s'. ModCDP supports macOS and Linux.%b\n" "${RED}" "$OS_NAME" "${RESET}" >&2
    exit 1
    ;;
esac

# 2. Detect CPU Architecture
ARCH_NAME="$(uname -m)"
case "$ARCH_NAME" in
  x86_64|amd64)
    ARCH="amd64"
    ;;
  arm64|aarch64)
    ARCH="arm64"
    ;;
  *)
    printf "%bError: Unsupported CPU architecture '%s'. ModCDP supports arm64 and amd64.%b\n" "${RED}" "$ARCH_NAME" "${RESET}" >&2
    exit 1
    ;;
esac

ASSET_NAME="modcdp-mcp-${OS}-${ARCH}"
INSTALL_BIN="${INSTALL_DIR:-$HOME/.local/bin}"
CONFIG_DIR="$HOME/.config/modcdp-mcp"
EXT_DIR="${CONFIG_DIR}/extensions"
REPO="le-dawg/modcdp-mcp"

# 3. Resolve Target Release Version
VERSION="${MODCDP_VERSION:-}"
if [ -z "$VERSION" ]; then
  printf "%b→ Resolving latest release from GitHub...%b\n" "${CYAN}" "${RESET}"
  LATEST_JSON=$(curl -sSL -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null || true)
  VERSION=$(printf "%s" "$LATEST_JSON" | grep '"tag_name":' | head -n1 | sed -E 's/.*"tag_name":[[:space:]]*"([^"]+)".*/\1/' || true)
fi

if [ -z "$VERSION" ]; then
  VERSION="v0.2.0"
fi

BASE_URL="${MODCDP_BASE_URL:-https://github.com/${REPO}/releases/download/${VERSION}}"
BIN_URL="${BASE_URL}/${ASSET_NAME}"
EXT_ARCHIVE_NAME="modcdp-extensions-${VERSION}.tar.gz"
EXT_URL="${BASE_URL}/${EXT_ARCHIVE_NAME}"

TMP_DIR="$(mktemp -d -t modcdp-install-XXXXXX 2>/dev/null || mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

mkdir -p "$INSTALL_BIN"
mkdir -p "$EXT_DIR"

printf "%b→ Platform: %s-%s%b\n" "${CYAN}" "$OS" "$ARCH" "${RESET}"
printf "%b→ Target release: %s%b\n" "${CYAN}" "$VERSION" "${RESET}"
printf "%b→ Downloading binary (%s)...%b\n" "${CYAN}" "$ASSET_NAME" "${RESET}"

DOWNLOAD_FAILED=0
if ! curl -fL --progress-bar "$BIN_URL" -o "${TMP_DIR}/modcdp-mcp" 2>/dev/null && \
   ! curl -fsSL "$BIN_URL" -o "${TMP_DIR}/modcdp-mcp" 2>/dev/null; then
  DOWNLOAD_FAILED=1
fi

if [ "$DOWNLOAD_FAILED" -eq 1 ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
  REPO_ROOT="$(cd "${SCRIPT_DIR}/.." 2>/dev/null && pwd || true)"
  if [ -f "${REPO_ROOT}/bin/modcdp-mcp" ]; then
    printf "%b⚠️  GitHub release asset not yet available (%s). Using local repository binary...%b\n" "${YELLOW}" "$BIN_URL" "${RESET}"
    cp "${REPO_ROOT}/bin/modcdp-mcp" "${TMP_DIR}/modcdp-mcp"
    DOWNLOAD_FAILED=0
  elif [ -f "${REPO_ROOT}/cmd/modcdp-mcp/main.go" ] && command -v go >/dev/null 2>&1; then
    printf "%b⚠️  GitHub release asset not yet available (%s). Building binary locally with Go...%b\n" "${YELLOW}" "$BIN_URL" "${RESET}"
    (cd "$REPO_ROOT" && go build -ldflags="-s -w" -o "${TMP_DIR}/modcdp-mcp" ./cmd/modcdp-mcp/)
    DOWNLOAD_FAILED=0
  else
    printf "%bError: Failed to download release binary from:%b\n  %s\n" "${RED}" "${RESET}" "$BIN_URL" >&2
    printf "Ensure the release is published or set MODCDP_VERSION / MODCDP_BASE_URL.\n" >&2
    exit 1
  fi
fi

# 4. Install Binary
cp "${TMP_DIR}/modcdp-mcp" "${INSTALL_BIN}/modcdp-mcp"
chmod +x "${INSTALL_BIN}/modcdp-mcp"
printf "%b✓ Binary installed to: %s/modcdp-mcp%b\n" "${GREEN}${BOLD}" "$INSTALL_BIN" "${RESET}"

# 5. Download and Extract Extensions Archive
printf "%b→ Downloading unpacked extension archive (%s)...%b\n" "${CYAN}" "$EXT_ARCHIVE_NAME" "${RESET}"
EXT_DOWNLOAD_FAILED=0
if ! curl -fL --progress-bar "$EXT_URL" -o "${TMP_DIR}/${EXT_ARCHIVE_NAME}" 2>/dev/null && \
   ! curl -fsSL "$EXT_URL" -o "${TMP_DIR}/${EXT_ARCHIVE_NAME}" 2>/dev/null; then
  EXT_DOWNLOAD_FAILED=1
fi

if [ "$EXT_DOWNLOAD_FAILED" -eq 1 ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
  REPO_ROOT="$(cd "${SCRIPT_DIR}/.." 2>/dev/null && pwd || true)"
  if [ -d "${REPO_ROOT}/extension" ] && command -v node >/dev/null 2>&1; then
    printf "%b⚠️  Extension archive not yet available on GitHub Releases. Building extensions locally...%b\n" "${YELLOW}" "${RESET}"
    (cd "$REPO_ROOT" && node scripts/build-extensions.mjs >/dev/null 2>&1 || true)
  else
    printf "%bWarning: Could not download extension archive from %s%b\n" "${YELLOW}" "$EXT_URL" "${RESET}"
  fi
else
  tar -xzf "${TMP_DIR}/${EXT_ARCHIVE_NAME}" -C "$EXT_DIR"
  printf "%b✓ Extensions unpacked to: %s%b\n" "${GREEN}${BOLD}" "$EXT_DIR" "${RESET}"
fi

# 6. Check Node.js and Offer Interactive Onboarding
RUN_ONBOARDING=0
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node -v)"
  printf "\n%bNode.js detected: %s%b\n" "${GREEN}" "$NODE_VER" "${RESET}"

  HAS_TTY=0
  if [ -n "${CI:-}" ] || [ -n "${NONINTERACTIVE:-}" ]; then
    HAS_TTY=0
  elif [ -t 0 ]; then
    HAS_TTY=1
  elif [ -c /dev/tty ] && [ -r /dev/tty ]; then
    HAS_TTY=1
  fi

  if [ "$HAS_TTY" -eq 1 ]; then
    printf "%bWould you like to run interactive onboarding now to configure AI agent harnesses? [Y/n] %b" "${CYAN}${BOLD}" "${RESET}"
    if [ -t 0 ]; then
      read -r REPLY || REPLY=""
    else
      read -r REPLY </dev/tty || REPLY=""
    fi
    case "$REPLY" in
      [nN]|[nN][oO])
        RUN_ONBOARDING=0
        ;;
      *)
        RUN_ONBOARDING=1
        ;;
    esac
  else
    printf "%b(Non-interactive shell detected; skipping automatic onboarding prompt)%b\n" "${YELLOW}" "${RESET}"
  fi

  if [ "$RUN_ONBOARDING" -eq 1 ]; then
    ONBOARD_SCRIPT=""
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
    REPO_ROOT="$(cd "${SCRIPT_DIR}/.." 2>/dev/null && pwd || true)"
    if [ -f "${REPO_ROOT}/scripts/onboard.mjs" ]; then
      ONBOARD_SCRIPT="${REPO_ROOT}/scripts/onboard.mjs"
    elif [ -f "./scripts/onboard.mjs" ]; then
      ONBOARD_SCRIPT="./scripts/onboard.mjs"
    else
      RAW_ONBOARD_URL="https://raw.githubusercontent.com/${REPO}/${VERSION}/scripts/onboard.mjs"
      curl -fsSL "$RAW_ONBOARD_URL" -o "${TMP_DIR}/onboard.mjs" 2>/dev/null || \
      curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/scripts/onboard.mjs" -o "${TMP_DIR}/onboard.mjs" 2>/dev/null || true
      if [ -f "${TMP_DIR}/onboard.mjs" ]; then
        ONBOARD_SCRIPT="${TMP_DIR}/onboard.mjs"
      fi
    fi

    if [ -n "$ONBOARD_SCRIPT" ] && [ -f "$ONBOARD_SCRIPT" ]; then
      printf "\n%bLaunching interactive onboarding...%b\n\n" "${GREEN}${BOLD}" "${RESET}"
      if [ -t 0 ]; then
        node "$ONBOARD_SCRIPT" || true
      elif [ -c /dev/tty ] && [ -r /dev/tty ]; then
        node "$ONBOARD_SCRIPT" </dev/tty || true
      else
        node "$ONBOARD_SCRIPT" || true
      fi
    else
      printf "%bNotice: Onboarding script not available offline. You can run 'npx modcdp-mcp onboard' later.%b\n" "${YELLOW}" "${RESET}"
    fi
  fi
else
  printf "\n%bℹ Node.js not detected. You can install Node.js (v18+) later to auto-configure harnesses via:%b\n" "${YELLOW}" "${RESET}"
  printf "  npx modcdp-mcp onboard\n"
fi

# 7. Post-Installation Guidance
printf "\n%b" "${GREEN}${BOLD}"
printf "════════════════════════════════════════════════════════════════════\n"
printf "   🎉 ModCDP Installation Complete!\n"
printf "════════════════════════════════════════════════════════════════════\n"
printf "%b\n" "${RESET}"

case ":$PATH:" in
  *":$INSTALL_BIN:"*)
    ;;
  *)
    printf "%b⚠️  Note: %s is not in your current PATH.%b\n" "${YELLOW}${BOLD}" "$INSTALL_BIN" "${RESET}"
    printf "   Add it to your shell configuration:\n"
    printf "   %bexport PATH=\"%s:\$PATH\"%b\n\n" "${BOLD}" "$INSTALL_BIN" "${RESET}"
    ;;
esac

printf "%bNext Steps:%b\n" "${CYAN}${BOLD}" "${RESET}"
printf " 1. %bLoad Unpacked Extensions in Chrome:%b\n" "${BOLD}" "${RESET}"
printf "    • Open Chrome and navigate to: %bchrome://extensions%b\n" "${BOLD}" "${RESET}"
printf "    • Toggle %bDeveloper mode%b (top-right)\n" "${BOLD}" "${RESET}"
printf "    • Click %bLoad unpacked%b and select:\n" "${BOLD}" "${RESET}"
printf "      📁 %s/main   (Main Chrome on :29292)\n" "$EXT_DIR"
printf "      📁 %s/dev    (Chrome Dev/Canary on :29293)\n" "$EXT_DIR"
printf "\n"
printf " 2. %bStart Background Broker or Launch AI Agent:%b\n" "${BOLD}" "${RESET}"
printf "    • Background daemon: %bmodcdp-mcp broker%b\n" "${BOLD}" "${RESET}"
printf "    • Direct MCP stdio:   %bmodcdp-mcp%b\n" "${BOLD}" "${RESET}"
printf "    • Compatible harnesses: Claude Code, OpenAI Codex, Gemini Antigravity, GitHub Copilot.\n\n"

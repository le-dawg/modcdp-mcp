#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, unlink, copyFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import readline from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = os.homedir();
const BIN = path.join(HOME, ".local", "bin", "modcdp-mcp");
const EXT_BASE = path.join(HOME, ".config", "modcdp-mcp", "extensions");
const MAIN_EXT = path.join(EXT_BASE, "main");
const DEV_EXT = path.join(EXT_BASE, "dev");
const BROKER_SOCKET = "/tmp/modcdp-broker.sock";
const LAUNCH_AGENT_LABEL = "com.dawgctor.modcdp-broker";
const LAUNCH_AGENT_PATH = path.join(HOME, "Library", "LaunchAgents", `${LAUNCH_AGENT_LABEL}.plist`);

const MCP_ENTRY = {
  command: BIN,
  args: [],
  env: {},
};

export const HARNESSES = [
  {
    id: "antigravity",
    number: "1",
    name: "Antigravity CLI",
    file: path.join(HOME, ".gemini", "antigravity-cli", "mcp_config.json"),
    type: "json",
    optional: true,
  },
  {
    id: "claude-code",
    number: "2",
    name: "Claude Code",
    file: path.join(HOME, ".claude.json"),
    type: "json",
    optional: true,
    claudeCode: true,
  },
  {
    id: "codex",
    number: "3",
    name: "OpenAI Codex",
    file: path.join(HOME, ".codex", "config.toml"),
    type: "toml",
    optional: true,
  },
  {
    id: "copilot",
    number: "4",
    name: "GitHub Copilot",
    file: path.join(HOME, ".copilot", "mcp-config.json"),
    type: "json",
    optional: true,
  },
  {
    id: "claude-desktop",
    number: "5",
    name: "Claude Desktop",
    file: path.join(HOME, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    type: "json",
    optional: true,
  },
];

function transformJSON(content, transform) {
  const obj = content.trim() ? JSON.parse(content) : {};
  transform(obj);
  return JSON.stringify(obj, null, 2);
}

function addMcpServer(obj, key, entry) {
  obj.mcpServers = obj.mcpServers || {};
  obj.mcpServers[key] = entry;
}

function transformClaudeCode(content) {
  return transformJSON(content, (obj) => {
    addMcpServer(obj, "modcdp", MCP_ENTRY);
    obj.disabledMcpServers = Array.from(new Set([...(obj.disabledMcpServers || []), "chrome-devtools"]));
  });
}

function transformToml(content) {
  const block = `[mcp_servers.modcdp]\ncommand = "${BIN}"\nargs = []\n`;
  if (content.includes("[mcp_servers.modcdp]")) {
    return content.replace(/\[mcp_servers\.modcdp\][^\[]*/s, block);
  }
  return content + (content.endsWith("\n") ? "" : "\n") + block;
}

function verifyJSON(content) {
  try {
    const obj = JSON.parse(content);
    return obj.mcpServers?.modcdp?.command === BIN;
  } catch {
    return false;
  }
}

function verifyToml(content) {
  return content.includes(`[mcp_servers.modcdp]`) && content.includes(`command = "${BIN}"`);
}

function transformHarnessContent(harness, content) {
  if (harness.type === "toml") return transformToml(content);
  if (harness.claudeCode) return transformClaudeCode(content);
  return transformJSON(content, (obj) => addMcpServer(obj, "modcdp", MCP_ENTRY));
}

function verifyHarnessContent(harness, content) {
  return harness.type === "toml" ? verifyToml(content) : verifyJSON(content);
}

async function planHarnessChanges(selectedIds) {
  const selected = HARNESSES.filter((h) => selectedIds.includes(h.id));
  const timestamp = Date.now();
  const changes = [];

  for (const harness of selected) {
    let original = harness.type === "toml" ? "" : "{}";
    try {
      original = await readFile(harness.file, "utf8");
    } catch {
      // create new config from empty content
    }

    changes.push({
      harness,
      original,
      transformed: transformHarnessContent(harness, original),
      backup: `${harness.file}.modcdp-bak.${timestamp}`,
    });
  }

  return changes;
}

async function applyHarnessChanges(changes, { dryRun = false } = {}) {
  if (dryRun) {
    return {
      ok: true,
      changed: changes.map((c) => ({ name: c.harness.name, file: c.harness.file, status: "DRY_RUN" })),
    };
  }

  for (const change of changes) {
    await mkdir(path.dirname(change.backup), { recursive: true });
    await writeFile(change.backup, change.original);
  }

  let failure = null;

  for (const change of changes) {
    try {
      await mkdir(path.dirname(change.harness.file), { recursive: true });
      await writeFile(change.harness.file, change.transformed);
    } catch (error) {
      failure = { harness: change.harness.name, error };
      break;
    }
  }

  if (!failure) {
    for (const change of changes) {
      try {
        const written = await readFile(change.harness.file, "utf8");
        if (!verifyHarnessContent(change.harness, written)) {
          failure = {
            harness: change.harness.name,
            error: new Error(`Verification failed for ${change.harness.file}`),
          };
          break;
        }
      } catch (error) {
        failure = { harness: change.harness.name, error };
        break;
      }
    }
  }

  if (failure) {
    for (const change of changes) {
      try {
        await writeFile(change.harness.file, change.original);
      } catch {}
      try {
        await unlink(change.backup);
      } catch {}
    }
    throw new Error(`Registration failed at ${failure.harness}: ${failure.error.message}`);
  }

  for (const change of changes) {
    try {
      await unlink(change.backup);
    } catch {}
  }

  return {
    ok: true,
    changed: changes.map((c) => ({ name: c.harness.name, file: c.harness.file, status: "CONFIGURED" })),
  };
}

export function parseHarnessSelection(input) {
  const trimmed = (input || "").trim().toLowerCase();
  if (!trimmed || trimmed === "manual" || trimmed === "m") {
    return { manualOnly: true, selectedIds: [] };
  }
  if (trimmed === "all" || trimmed === "a") {
    return { manualOnly: false, selectedIds: HARNESSES.map((h) => h.id) };
  }

  const tokens = trimmed
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const selectedIds = [];
  for (const token of tokens) {
    const match = HARNESSES.find((h) => h.id === token || h.number === token);
    if (!match) continue;
    if (!selectedIds.includes(match.id)) selectedIds.push(match.id);
  }

  return { manualOnly: selectedIds.length === 0, selectedIds };
}

export function renderManualInstructions() {
  return [
    "Manual extension loading:",
    `  1. Build the unpacked extensions: node ${path.join(ROOT, "scripts", "build-extensions.mjs")}`,
    "  2. Open chrome://extensions in Main Chrome.",
    "  3. Enable Developer Mode.",
    `  4. Click 'Load unpacked' and select: ${MAIN_EXT}`,
    "  5. Open chrome://extensions in Chrome Dev.",
    `  6. Click 'Load unpacked' and select: ${DEV_EXT}`,
    "  7. Keep both browsers running; the bridge listens on Main Chrome :29292 and Chrome Dev :29293.",
    `  8. If needed, run the broker manually: ${BIN} broker`,
  ].join("\n");
}

export function renderBrokerStatusTable(status) {
  const rows = [
    ["main", status?.main?.state || "UNREACHABLE", status?.main?.info?.extension_version || "-"],
    ["dev", status?.dev?.state || "UNREACHABLE", status?.dev?.info?.extension_version || "-"],
  ];

  const widths = [
    Math.max("Browser".length, ...rows.map((row) => row[0].length)),
    Math.max("State".length, ...rows.map((row) => row[1].length)),
    Math.max("Version".length, ...rows.map((row) => row[2].length)),
  ];

  const formatRow = (cells) => cells.map((cell, i) => cell.padEnd(widths[i])).join(" | ");
  const divider = widths.map((width) => "-".repeat(width)).join("-|-\n").replace(/\n/g, "");

  return [
    formatRow(["Browser", "State", "Version"]),
    divider,
    ...rows.map(formatRow),
  ].join("\n");
}

export async function queryBrokerStatus(socketPath = BROKER_SOCKET) {
  return new Promise((resolve) => {
    const client = net.createConnection(socketPath);
    let buffer = "";

    client.on("connect", () => {
      client.write(JSON.stringify({ action: "status" }) + "\n");
    });

    client.on("data", (chunk) => {
      buffer += chunk.toString();
      const line = buffer.trim();
      if (!line) return;
      try {
        const parsed = JSON.parse(line);
        client.end();
        resolve(parsed);
      } catch {
        // wait for full line
      }
    });

    client.on("error", () => resolve(null));
    client.on("end", () => {
      if (!buffer.trim()) resolve(null);
    });
  });
}

async function waitForBroker(socketPath = BROKER_SOCKET, timeoutMs = 3000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const status = await queryBrokerStatus(socketPath);
    if (status) return status;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

async function verifyBroker() {
  const existing = await queryBrokerStatus();
  if (existing) {
    return { mode: "existing", status: existing };
  }

  if (!existsSync(BIN)) {
    return { mode: "missing-binary", status: null };
  }

  const child = spawn(BIN, ["broker"], {
    stdio: "ignore",
    detached: false,
  });

  try {
    const status = await waitForBroker();
    return { mode: "ephemeral", status };
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

function buildLaunchAgentPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-lc</string>
    <string>$HOME/.local/bin/modcdp-mcp broker</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/modcdp-broker.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/modcdp-broker.err</string>
</dict>
</plist>
`;
}

async function installLaunchAgent() {
  if (process.platform !== "darwin") {
    return { installed: false, reason: "launchd is macOS-only" };
  }

  await mkdir(path.dirname(LAUNCH_AGENT_PATH), { recursive: true });
  await writeFile(LAUNCH_AGENT_PATH, buildLaunchAgentPlist(), "utf8");

  const domain = `gui/${process.getuid()}`;
  try {
    execFileSync("launchctl", ["bootout", domain, LAUNCH_AGENT_PATH], { stdio: "ignore" });
  } catch {}
  execFileSync("launchctl", ["bootstrap", domain, LAUNCH_AGENT_PATH], { stdio: "ignore" });
  execFileSync("launchctl", ["enable", `${domain}/${LAUNCH_AGENT_LABEL}`], { stdio: "ignore" });

  return { installed: true, path: LAUNCH_AGENT_PATH };
}

async function ensureExtensionsBuilt() {
  const child = spawn(process.execPath, [path.join(ROOT, "scripts", "build-extensions.mjs")], {
    stdio: "inherit",
  });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  if (code !== 0) {
    throw new Error("Extension build failed.");
  }
}

function printHarnessMenu() {
  console.log("\nAvailable harness targets:");
  for (const harness of HARNESSES) {
    const detected = existsSync(harness.file) ? "config-present" : "config-missing";
    console.log(`  [${harness.number}] ${harness.name.padEnd(18)} ${detected}  ${harness.file}`);
  }
  console.log("  [a] all");
  console.log("  [m] manual-only (skip config file edits)");
}

async function main() {
  console.log("\n=======================================================");
  console.log("   ModCDP MCP interactive onboarding");
  console.log("=======================================================\n");

  if (!existsSync(BIN)) {
    console.log(`Binary not found at ${BIN}`);
    console.log(`Build it first with:\n  go build -o ${BIN} ./cmd/modcdp-mcp/\n`);
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const rebuildAnswer = (await rl.question("Rebuild the unpacked Chrome extensions now? [Y/n] ")).trim().toLowerCase();
    if (rebuildAnswer === "" || rebuildAnswer === "y" || rebuildAnswer === "yes") {
      await ensureExtensionsBuilt();
    }

    printHarnessMenu();
    const selection = await rl.question("\nWhich harnesses do you want to configure? ");
    const parsed = parseHarnessSelection(selection);

    if (!parsed.manualOnly) {
      const changes = await planHarnessChanges(parsed.selectedIds);
      const result = await applyHarnessChanges(changes);
      console.log("\nConfigured harnesses:");
      for (const change of result.changed) {
        console.log(`  ✓ ${change.name} → ${change.file}`);
      }
    } else {
      console.log("\nManual mode selected. No harness config files were changed.");
    }

    if (process.platform === "darwin") {
      const launchdAnswer = (await rl.question("\nInstall or refresh the macOS launchd broker daemon? [Y/n] ")).trim().toLowerCase();
      if (launchdAnswer === "" || launchdAnswer === "y" || launchdAnswer === "yes") {
        const launchd = await installLaunchAgent();
        if (launchd.installed) {
          console.log(`  ✓ launchd agent installed at ${launchd.path}`);
        }
      }
    }

    if (parsed.manualOnly) {
      console.log(`\n${renderManualInstructions()}\n`);
    }

    const verification = await verifyBroker();
    console.log("Broker verification:");
    if (!verification.status) {
      console.log("  Broker socket was not reachable.");
      console.log(`  Start it with: ${BIN} broker`);
    } else {
      console.log(`  Mode: ${verification.mode}`);
      console.log(renderBrokerStatusTable(verification.status));
      process.stdout.write("\u0007");
    }

    console.log("\nDone. If a browser shows as DISCONNECTED, load its unpacked extension and refresh the extension service worker.");
  } finally {
    rl.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\n✗ ${error.message}`);
    process.exit(1);
  });
}

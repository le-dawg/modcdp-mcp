#!/usr/bin/env node
// scripts/register-harnesses.mjs — transactional multi-harness MCP registration
// Usage: node scripts/register-harnesses.mjs [--dry-run]

import { readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const HOME = os.homedir();
const BIN = path.join(HOME, ".local", "bin", "modcdp-mcp");
const DRY_RUN = process.argv.includes("--dry-run");

const MCP_ENTRY = {
  command: BIN,
  args: [],
  env: {},
};

// --- Harness transformers ---

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
    // Disable old chrome-devtools MCP in claude code (superseded by modcdp)
    obj.disabledMcpServers = Array.from(new Set([
      ...(obj.disabledMcpServers || []),
      "chrome-devtools",
    ]));
  });
}

function transformToml(content) {
  const block = `[mcp_servers.modcdp]\ncommand = "${BIN}"\nargs = []\n`;
  if (content.includes("[mcp_servers.modcdp]")) {
    // Idempotent: replace existing block
    return content.replace(/\[mcp_servers\.modcdp\][^\[]*/s, block);
  }
  return content + (content.endsWith("\n") ? "" : "\n") + block;
}

function verifyJSON(content, key) {
  try {
    const obj = JSON.parse(content);
    return obj.mcpServers?.[key]?.command === BIN;
  } catch {
    return false;
  }
}

function verifyToml(content) {
  return content.includes(`command = "${BIN}"`);
}

const HARNESSES = [
  {
    name: "Antigravity CLI",
    file: path.join(HOME, ".gemini", "antigravity-cli", "mcp_config.json"),
    transform: (c) => transformJSON(c, (obj) => addMcpServer(obj, "modcdp", MCP_ENTRY)),
    verify: (c) => verifyJSON(c, "modcdp"),
    optional: false,
  },
  {
    name: "Claude Code CLI",
    file: path.join(HOME, ".claude.json"),
    transform: transformClaudeCode,
    verify: (c) => verifyJSON(c, "modcdp"),
    optional: false,
  },
  {
    name: "Claude Desktop",
    file: path.join(HOME, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    transform: (c) => transformJSON(c, (obj) => addMcpServer(obj, "modcdp", MCP_ENTRY)),
    verify: (c) => verifyJSON(c, "modcdp"),
    optional: true,
  },
  {
    name: "OpenAI Codex",
    file: path.join(HOME, ".codex", "config.toml"),
    transform: transformToml,
    verify: verifyToml,
    optional: false,
  },
  {
    name: "GitHub Copilot",
    file: path.join(HOME, ".copilot", "mcp-config.json"),
    transform: (c) => transformJSON(c, (obj) => addMcpServer(obj, "modcdp", MCP_ENTRY)),
    verify: (c) => verifyJSON(c, "modcdp"),
    optional: true,
  },
];

async function run() {
  if (!existsSync(BIN)) {
    throw new Error(
      `Binary not found at ${BIN}.\n` +
      `Build it with: GOARCH=arm64 GOOS=darwin go build -o ~/.local/bin/modcdp-mcp ./cmd/modcdp-mcp/`
    );
  }

  const timestamp = Date.now();

  // Phase 1: Plan — build list of harnesses to process
  const changes = [];
  for (const h of HARNESSES) {
    if (h.optional && !existsSync(h.file)) {
      console.log(`  skip ${h.name} (file not found, optional)`);
      continue;
    }
    let original = "";
    try {
      original = await readFile(h.file, "utf8");
    } catch {
      // File doesn't exist yet — start with empty
      original = h.file.endsWith(".toml") ? "" : "{}";
    }
    const transformed = h.transform(original);
    const backup = `${h.file}.modcdp-bak.${timestamp}`;
    changes.push({ h, original, transformed, backup });
  }

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Would apply the following changes:");
    for (const c of changes) {
      console.log(`  • ${c.h.name}: ${c.h.file}`);
    }
    return;
  }

  console.log(`\nRegistering modcdp-mcp across ${changes.length} harnesses...`);

  // Phase 2: Snapshot — write backups before any mutations
  for (const c of changes) {
    await writeFile(c.backup, c.original);
  }

  // Phase 3: Apply — write transformed configs
  let failedAt = null;
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    try {
      // Ensure parent directory exists
      const dir = path.dirname(c.h.file);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      await writeFile(c.h.file, c.transformed);
    } catch (e) {
      failedAt = { index: i, error: e, harness: c.h.name };
      break;
    }
  }

  // Phase 4: Verify — read back and assert correctness
  if (!failedAt) {
    for (let i = 0; i < changes.length; i++) {
      const c = changes[i];
      try {
        const written = await readFile(c.h.file, "utf8");
        if (!c.h.verify(written)) {
          failedAt = {
            index: i,
            error: new Error(`Verification failed: ${c.h.file} does not contain expected modcdp config`),
            harness: c.h.name,
          };
          break;
        }
      } catch (e) {
        failedAt = { index: i, error: e, harness: c.h.name };
        break;
      }
    }
  }

  // Phase 5: Commit or Rollback
  if (failedAt) {
    console.error(`\n✗ Registration failed at [${failedAt.harness}]: ${failedAt.error.message}`);
    console.error("  Rolling back ALL harness files...");
    for (const c of changes) {
      try {
        await writeFile(c.h.file, c.original);
      } catch (restoreErr) {
        console.error(`  WARNING: could not restore ${c.h.file}: ${restoreErr.message}`);
      }
      try { await unlink(c.backup); } catch {}
    }
    console.error("  Rollback complete. No harnesses were modified.");
    process.exit(1);
  }

  // Delete backups on success
  for (const c of changes) {
    try { await unlink(c.backup); } catch {}
  }

  console.log("\n✓ All harnesses registered successfully:");
  for (const c of changes) {
    console.log(`  ✓ ${c.h.name}: ${c.h.file}`);
  }
  console.log(`\nBinary: ${BIN}`);
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

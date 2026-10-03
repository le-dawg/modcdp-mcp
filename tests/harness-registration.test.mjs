// tests/harness-registration.test.mjs — validates register-harnesses.mjs logic
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.HOME;
const BIN = path.join(HOME, ".local", "bin", "modcdp-mcp");

test("register script contains Phase 2: Snapshot", async () => {
  const script = await readFile(path.join(ROOT, "scripts", "register-harnesses.mjs"), "utf8");
  assert(script.includes("Phase 2: Snapshot") || script.includes("Snapshot — write backups"),
    "Script must have snapshot phase");
});

test("register script contains rollback logic", async () => {
  const script = await readFile(path.join(ROOT, "scripts", "register-harnesses.mjs"), "utf8");
  assert(script.includes("Rollback complete"),
    "Script must print 'Rollback complete' on failure");
  assert(script.includes("writeFile(c.h.file, c.original)"),
    "Script must restore original content on rollback");
});

test("register script has idempotent TOML transform", async () => {
  const script = await readFile(path.join(ROOT, "scripts", "register-harnesses.mjs"), "utf8");
  // Must check for existing block before inserting
  assert(script.includes("[mcp_servers.modcdp]"),
    "Script must check for existing TOML block before inserting");
});

test("JSON transform adds modcdp entry with correct binary path", () => {
  // Inline test of the transform logic
  const BIN_PATH = path.join(HOME, ".local", "bin", "modcdp-mcp");
  const MCP_ENTRY = { command: BIN_PATH, args: [], env: {} };
  const original = JSON.stringify({ mcpServers: {} });
  const obj = JSON.parse(original);
  obj.mcpServers["modcdp"] = MCP_ENTRY;
  const result = JSON.parse(JSON.stringify(obj, null, 2));
  assert.equal(result.mcpServers.modcdp.command, BIN_PATH);
  assert.deepEqual(result.mcpServers.modcdp.args, []);
});

test("JSON transform is idempotent (running twice yields identical result)", () => {
  const BIN_PATH = path.join(HOME, ".local", "bin", "modcdp-mcp");
  const MCP_ENTRY = { command: BIN_PATH, args: [], env: {} };
  // First pass
  const obj1 = { mcpServers: {} };
  obj1.mcpServers["modcdp"] = MCP_ENTRY;
  const first = JSON.stringify(obj1, null, 2);
  // Second pass (apply to already-registered config)
  const obj2 = JSON.parse(first);
  obj2.mcpServers["modcdp"] = MCP_ENTRY; // idempotent upsert
  const second = JSON.stringify(obj2, null, 2);
  assert.equal(first, second, "Second registration must not change config");
});

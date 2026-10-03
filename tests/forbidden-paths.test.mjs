// tests/forbidden-paths.test.mjs — asserts zero legacy path leakage
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

const HOME = process.env.HOME;
const EXT_BASE = path.join(HOME, ".config", "modcdp-mcp", "extensions");
const BIN = path.join(HOME, ".local", "bin", "modcdp-mcp");

const FORBIDDEN = [
  "/Users/thedawgctor/Desktop/tempfuk/terminal-help",
  "github.com/modcdp/modcdp-harness",
];

const BUILT_FILES = [
  path.join(EXT_BASE, "main", "modcdp", "service_worker.js"),
  path.join(EXT_BASE, "main", "manifest.json"),
  path.join(EXT_BASE, "dev", "modcdp", "service_worker.js"),
  path.join(EXT_BASE, "dev", "manifest.json"),
];

test("built extension files contain no forbidden scratch paths", async () => {
  for (const file of BUILT_FILES) {
    const content = await readFile(file, "utf8");
    for (const forbidden of FORBIDDEN) {
      assert(
        !content.includes(forbidden),
        `Forbidden path "${forbidden}" found in ${path.basename(file)}`
      );
    }
  }
});

test("binary strings contain no forbidden legacy module name", () => {
  if (!existsSync(BIN)) {
    throw new Error(`Binary not found at ${BIN} — run: go build -o ~/.local/bin/modcdp-mcp ./cmd/modcdp-mcp/`);
  }
  const binStrings = execSync(`strings "${BIN}"`, { encoding: "utf8" });
  const forbidden = "github.com/modcdp/modcdp-harness";
  assert(
    !binStrings.includes(forbidden),
    `Forbidden legacy module "${forbidden}" found in binary strings at ${BIN}`
  );
});

test("binary strings contain correct new module name", () => {
  if (!existsSync(BIN)) return; // skip if not built
  const binStrings = execSync(`strings "${BIN}"`, { encoding: "utf8" });
  assert(
    binStrings.includes("github.com/dawgctor/modcdp-mcp"),
    `Expected module "github.com/dawgctor/modcdp-mcp" not found in binary strings`
  );
});

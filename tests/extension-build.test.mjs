// tests/extension-build.test.mjs — verifies built extension bundle integrity
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const HOME = process.env.HOME;
const EXT_BASE = path.join(HOME, ".config", "modcdp-mcp", "extensions");

const SLOTS = [
  { tag: "main", port: 29292 },
  { tag: "dev",  port: 29293 },
];

for (const slot of SLOTS) {
  const swPath = path.join(EXT_BASE, slot.tag, "modcdp", "service_worker.js");
  const manifestPath = path.join(EXT_BASE, slot.tag, "manifest.json");

  test(`${slot.tag}: service_worker.js contains port ${slot.port}`, async () => {
    const sw = await readFile(swPath, "utf8");
    assert(
      sw.includes(String(slot.port)),
      `Expected port ${slot.port} in ${swPath}`
    );
  });

  test(`${slot.tag}: service_worker.js does NOT contain NATS port 4223`, async () => {
    const sw = await readFile(swPath, "utf8");
    assert(
      !sw.includes("ws://127.0.0.1:4223"),
      `Found forbidden NATS URL ws://127.0.0.1:4223 in ${swPath}`
    );
  });

  test(`${slot.tag}: manifest.json contains "scripting" permission`, async () => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert(
      Array.isArray(manifest.permissions) && manifest.permissions.includes("scripting"),
      `"scripting" missing from permissions in ${manifestPath}`
    );
  });

  test(`${slot.tag}: manifest.json contains "offscreen" permission`, async () => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert(
      manifest.permissions.includes("offscreen"),
      `"offscreen" missing from permissions in ${manifestPath}`
    );
  });

  test(`${slot.tag}: manifest.json contains "scripting" and correct name`, async () => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert(
      manifest.name.toLowerCase().includes(slot.tag),
      `manifest name should include slot tag '${slot.tag}', got '${manifest.name}'`
    );
  });

  test(`${slot.tag}: offscreen_keepalive.js exists and contains keepalive`, async () => {
    const keepalivePath = path.join(EXT_BASE, slot.tag, "offscreen", "offscreen_keepalive.js");
    const content = await readFile(keepalivePath, "utf8");

    assert(
      content.includes("keepalive"),
      `offscreen_keepalive.js missing keepalive logic in ${keepalivePath}`
    );
  });
}

#!/usr/bin/env node
// build-extensions.mjs — builds dual-slot MV3 extensions from upstream compiled dist
//
// Strategy: Take the upstream pre-compiled ~/.modcdp/dist/extension, patch it to:
//   1. Remove NATS port 4223 (replace reconnect loop with no-op)
//   2. Set correct slot port (29292 for main, 29293 for dev)
//   3. Add "scripting" permission to manifest
//   4. Add self-healing offscreen keepalive script
//   5. Write to ~/.config/modcdp-mcp/extensions/{main,dev}
//
// This avoids re-running the full TypeScript compiler for upstream internals.

import { mkdir, writeFile, readFile, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = os.homedir();
const DEST_BASE = path.join(HOME, ".config", "modcdp-mcp", "extensions");

const BASE_EXT = existsSync(path.join(ROOT, "extension", "base"))
  ? path.join(ROOT, "extension", "base")
  : path.join(HOME, ".modcdp", "dist", "extension");

if (!existsSync(BASE_EXT)) {
  console.error(`Base extension dist not found at ${BASE_EXT}`);
  process.exit(1);
}


// Self-contained offscreen keepalive JS (no build step needed — it's tiny)
const OFFSCREEN_KEEPALIVE_JS = `\
// modcdp-mcp offscreen keepalive — keeps service worker alive
const port = chrome.runtime.connect({ name: "modcdp-offscreen-keepalive" });
setInterval(() => { port.postMessage({ type: "keepalive" }); }, 5000);
port.onDisconnect.addListener(() => console.warn("[ModCDP offscreen] port disconnected"));
`;

const OFFSCREEN_KEEPALIVE_HTML = `\
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>ModCDP Keepalive</title></head>
  <body><script type="module" src="../modcdp/offscreen_keepalive.js"></script></body>
</html>
`;

const SLOTS = [
  { tag: "main", port: 29292, dest: path.join(DEST_BASE, "main") },
  { tag: "dev",  port: 29293, dest: path.join(DEST_BASE, "dev") },
];

// Read upstream service worker (compiled JS)
const upstreamSW = await readFile(
  path.join(BASE_EXT, "modcdp", "service_worker.js"),
  "utf8"
);

for (const slot of SLOTS) {
  console.log(`\nBuilding extension slot: ${slot.tag} (port ${slot.port}) → ${slot.dest}`);

  // Clean and recreate target
  await rm(slot.dest, { recursive: true, force: true });
  await mkdir(path.join(slot.dest, "modcdp"), { recursive: true });
  await mkdir(path.join(slot.dest, "pages"), { recursive: true });

  // Patch service worker:
  let sw = upstreamSW;

  // 1. Replace all occurrences of 29292 with the slot port (no-op for main slot)
  if (slot.port !== 29292) {
    sw = sw.replaceAll("29292", String(slot.port));
  }

  // 2. Neutralize NATS port 4223 reconnect:
  //    The NATSDownstreamTransport tries to connect to ws://127.0.0.1:4223
  //    Replace the NATS URL string with a dead-end URL that will silently fail
  //    without the 2000ms reconnect spam.
  sw = sw.replaceAll("ws://127.0.0.1:4223", "ws://127.0.0.1:1");

  // 3. Add browser tag to hello handshake if pattern is found
  sw = sw.replace(
    /type:\s*"modcdp\.reverse\.hello",\s*role:\s*"extension-service-worker",\s*version:\s*1,\s*extension_id:\s*([^\n,}]+)/g,
    `type: "modcdp.reverse.hello", role: "extension-service-worker", version: 1, browser: "${slot.tag}", extension_id: $1`
  );

  await writeFile(path.join(slot.dest, "modcdp", "service_worker.js"), sw);

  // Write self-contained offscreen keepalive
  await writeFile(path.join(slot.dest, "modcdp", "offscreen_keepalive.js"), OFFSCREEN_KEEPALIVE_JS);
  await writeFile(path.join(slot.dest, "pages", "offscreen_keepalive.html"), OFFSCREEN_KEEPALIVE_HTML);

  // Patch manifest: add "scripting", rename, update service worker ref
  const upstreamManifest = JSON.parse(
    await readFile(path.join(BASE_EXT, "manifest.json"), "utf8")
  );
  const manifest = {
    ...upstreamManifest,
    name: `ModCDP Bridge (${slot.tag})`,
    description: `ModCDP standalone MCP bridge for ${slot.tag === "main" ? "Main Chrome" : "Chrome Dev"} on port ${slot.port}`,
    permissions: Array.from(new Set([
      ...(upstreamManifest.permissions || []),
      "scripting",
    ])),
    background: {
      ...upstreamManifest.background,
      service_worker: "modcdp/service_worker.js",
    },
  };
  await writeFile(path.join(slot.dest, "manifest.json"), JSON.stringify(manifest, null, 2));

  // Copy any remaining static files from upstream (options.html etc)
  const staticFiles = ["options.html", "options.js"];
  for (const f of staticFiles) {
    const src = path.join(BASE_EXT, f);
    if (existsSync(src)) {
      await cp(src, path.join(slot.dest, f));
    }
  }


  // --- POST-BUILD ASSERTIONS ---
  const builtSW = await readFile(path.join(slot.dest, "modcdp", "service_worker.js"), "utf8");
  const builtManifest = JSON.parse(await readFile(path.join(slot.dest, "manifest.json"), "utf8"));

  // Assert correct port is present
  if (!builtSW.includes(String(slot.port))) {
    throw new Error(`ASSERTION FAILED: Built service_worker.js missing port ${slot.port}`);
  }
  // Assert NATS 4223 is absent (replaced with dead-end port 1)
  if (builtSW.includes("ws://127.0.0.1:4223")) {
    throw new Error(`ASSERTION FAILED: Built service_worker.js still contains NATS port 4223`);
  }
  // Assert "scripting" permission present
  if (!builtManifest.permissions.includes("scripting")) {
    throw new Error(`ASSERTION FAILED: manifest.json missing "scripting" permission`);
  }
  // Assert "offscreen" permission present
  if (!builtManifest.permissions.includes("offscreen")) {
    throw new Error(`ASSERTION FAILED: manifest.json missing "offscreen" permission`);
  }

  console.log(`  ✓ port=${slot.port} present`);
  console.log(`  ✓ NATS 4223 neutralized`);
  console.log(`  ✓ "scripting" permission added`);
  console.log(`  ✓ offscreen keepalive written`);
  console.log(`  ✓ ${slot.tag} extension ready at ${slot.dest}`);
}

console.log("\n✓ Both extensions built and verified.");
console.log(`\nTo load in Chrome:`);
console.log(`  Main Chrome → ${path.join(DEST_BASE, "main")}`);
console.log(`  Chrome Dev  → ${path.join(DEST_BASE, "dev")}`);

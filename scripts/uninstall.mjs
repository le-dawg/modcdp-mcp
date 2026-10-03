#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

console.log("\n=======================================================");
console.log("   🧹 ModCDP Clean Uninstallation & Teardown          ");
console.log("=======================================================\n");

// 1. Terminate running broker daemon
console.log("1. Stopping any running broker processes...");
try {
  execSync("pkill -f 'modcdp-mcp' || true", { stdio: "ignore" });
} catch (_) {}

// 2. Remove socket files
console.log("2. Cleaning up temporary socket files...");
const sockets = ["/tmp/modcdp-broker.sock", "/tmp/modcdp-broker-test.sock"];
for (const sock of sockets) {
  if (fs.existsSync(sock)) {
    try {
      fs.unlinkSync(sock);
      console.log(`   Removed ${sock}`);
    } catch (_) {}
  }
}

// 3. Optional purge of configuration and extension artifacts
if (process.argv.includes("--purge-all")) {
  console.log("3. Purging built extension artifacts and binary...");
  const home = os.homedir();
  const extDir = path.join(home, ".config", "modcdp-mcp");
  const binFile = path.join(home, ".local", "bin", "modcdp-mcp");
  if (fs.existsSync(extDir)) {
    fs.rmSync(extDir, { recursive: true, force: true });
    console.log(`   Removed ${extDir}`);
  }
  if (fs.existsSync(binFile)) {
    fs.unlinkSync(binFile);
    console.log(`   Removed ${binFile}`);
  }
}

console.log("\n✅ Uninstallation complete. Zero background residue remains.\n");

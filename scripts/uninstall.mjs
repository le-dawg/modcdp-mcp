#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

console.log("\n=======================================================");
console.log("   🧹 ModCDP Clean Uninstallation & Teardown          ");
console.log("=======================================================\n");

const home = os.homedir();
const plistPath = path.join(home, "Library", "LaunchAgents", "com.dawgctor.modcdp-broker.plist");
const binFile = path.join(home, ".local", "bin", "modcdp-mcp");
const extDir = path.join(home, ".config", "modcdp-mcp", "extensions");
const configDir = path.join(home, ".config", "modcdp-mcp");

// 1. Safely unload macOS launchd daemon
if (process.platform === "darwin") {
  console.log("1. Unloading launchd broker service...");
  try {
    execSync(
      `launchctl bootout gui/$(id -u)/com.dawgctor.modcdp-broker 2>/dev/null || launchctl unload ~/Library/LaunchAgents/com.dawgctor.modcdp-broker.plist 2>/dev/null || true`,
      { stdio: "ignore" }
    );
  } catch (err) {
    console.log(`   Notice: ${err.message}`);
  }

  // Remove plist file
  if (fs.existsSync(plistPath)) {
    try {
      fs.unlinkSync(plistPath);
      console.log(`   Removed ${plistPath}`);
    } catch (err) {
      console.log(`   Notice: Failed to remove plist: ${err.message}`);
    }
  }
}

// 2. Terminate any remaining running broker process
console.log("2. Stopping any remaining broker processes...");
try {
  execSync("pkill -f 'modcdp-mcp' || true", { stdio: "ignore" });
} catch (_) {}

// 3. Remove socket files
console.log("3. Cleaning up temporary socket files...");
const sockets = ["/tmp/modcdp-broker.sock", "/tmp/modcdp-broker-test.sock"];
for (const sock of sockets) {
  if (fs.existsSync(sock)) {
    try {
      fs.unlinkSync(sock);
      console.log(`   Removed ${sock}`);
    } catch (_) {}
  }
}

// 4. Remove installed binary
console.log("4. Removing installed binary...");
if (fs.existsSync(binFile)) {
  try {
    fs.unlinkSync(binFile);
    console.log(`   Removed ${binFile}`);
  } catch (err) {
    console.log(`   Notice: Failed to remove binary: ${err.message}`);
  }
}

// 5. Remove extensions directory
console.log("5. Removing extensions directory...");
if (fs.existsSync(extDir)) {
  try {
    fs.rmSync(extDir, { recursive: true, force: true });
    console.log(`   Removed ${extDir}`);
  } catch (err) {
    console.log(`   Notice: Failed to remove extensions: ${err.message}`);
  }
}

// 6. Clean up config root if empty or if --purge-all specified
if (fs.existsSync(configDir)) {
  try {
    const entries = fs.readdirSync(configDir);
    if (entries.length === 0 || process.argv.includes("--purge-all")) {
      fs.rmSync(configDir, { recursive: true, force: true });
      console.log(`   Removed ${configDir}`);
    }
  } catch (_) {}
}

console.log("\n✅ Uninstallation complete. Zero background residue remains.\n");

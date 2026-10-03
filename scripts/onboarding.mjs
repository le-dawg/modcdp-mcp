#!/usr/bin/env node
// scripts/onboarding.mjs — Interactive setup and multi-harness onboarding
import readline from "node:readline";
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";

const HOME = os.homedir();
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BIN = path.join(HOME, ".local", "bin", "modcdp-mcp");
const EXT_BASE = path.join(HOME, ".config", "modcdp-mcp", "extensions");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

console.log("\n========================================================");
console.log("   🚀 ModCDP Standalone MCP Bridge — Interactive Setup  ");
console.log("========================================================\n");

async function main() {
  // Step 1: Check/Build Binary & Extensions
  console.log("📦 1. Building core binary and dual-browser extensions...");
  try {
    execSync("mkdir -p ~/.local/bin", { stdio: "ignore" });
    execSync(`GOARCH=arm64 GOOS=darwin go build -o "${BIN}" ./cmd/modcdp-mcp/`, {
      cwd: ROOT,
      stdio: "ignore",
    });
    execSync("node scripts/build-extensions.mjs", {
      cwd: ROOT,
      stdio: "ignore",
    });
    console.log("   ✓ Compiled binary to ~/.local/bin/modcdp-mcp");
    console.log("   ✓ Built extensions in ~/.config/modcdp-mcp/extensions/{main,dev}\n");
  } catch (err) {
    console.error("   ✗ Build failed:", err.message);
    process.exit(1);
  }

  // Step 2: Install/Start LaunchAgent Daemon
  console.log("⚙️  2. Starting background broker daemon (launchd)...");
  try {
    const plistPath = path.join(HOME, "Library", "LaunchAgents", "com.dawgctor.modcdp-broker.plist");
    const plistTemplate = path.join(ROOT, "scripts", "com.dawgctor.modcdp-broker.plist");
    mkdirSync(path.dirname(plistPath), { recursive: true });
    writeFileSync(plistPath, readFileSync(plistTemplate, "utf8"));
    execSync(`launchctl bootout gui/$(id -u)/com.dawgctor.modcdp-broker 2>/dev/null || true`, { stdio: "ignore" });
    execSync(`launchctl bootstrap gui/$(id -u) "${plistPath}"`, { stdio: "ignore" });
    console.log("   ✓ launchd daemon com.dawgctor.modcdp-broker is running 24/7\n");
  } catch (err) {
    console.log("   ⚠️ Warning setting up launchd:", err.message);
  }

  // Step 3: Interactive CLI Harness Selection
  console.log("🤖 3. AI Agent Terminal CLIs & Harness Selection");
  console.log("   Which AI harnesses do you have installed and want to configure?");
  console.log("   [1] Antigravity CLI  (Google Gemini)");
  console.log("   [2] Claude Code CLI  (Anthropic)");
  console.log("   [3] Claude Desktop   (Anthropic)");
  console.log("   [4] OpenAI Codex     (OpenAI)");
  console.log("   [5] GitHub Copilot   (GitHub)");
  console.log("   [A] All of the above (Recommended)");
  console.log("   [N] None / Manual Extension Setup Only\n");

  const choice = (await ask("   Enter your selection [1,2,3,4,5, A, N] (Default: A): ")).trim().toUpperCase() || "A";

  if (choice === "N") {
    console.log("\n   Skipping AI harness auto-registration.");
  } else {
    console.log("\n   Configuring selected AI agent harnesses...");
    try {
      execSync("node scripts/register-harnesses.mjs", { cwd: ROOT, stdio: "inherit" });
    } catch (err) {
      console.error("   ✗ Error registering harnesses:", err.message);
    }
  }

  // Step 4: Extension Loading Instructions
  console.log("\n========================================================");
  console.log("   🌐 4. Chrome Extension Installation Instructions    ");
  console.log("========================================================\n");
  console.log("To connect your live browsers, load the unpacked extensions:\n");
  console.log("🔹 Main Google Chrome (Port 29292):");
  console.log("   1. Open Google Chrome and navigate to: chrome://extensions");
  console.log("   2. Turn ON 'Developer mode' in the top-right corner.");
  console.log("   3. Click 'Load unpacked' and select folder:");
  console.log(`      📁 ${path.join(EXT_BASE, "main")}\n`);

  console.log("🔹 Google Chrome Dev (Port 29293):");
  console.log("   1. Open Google Chrome Dev and navigate to: chrome://extensions");
  console.log("   2. Turn ON 'Developer mode'.");
  console.log("   3. Click 'Load unpacked' and select folder:");
  console.log(`      📁 ${path.join(EXT_BASE, "dev")}\n`);

  // Step 5: Check Broker Connection
  console.log("🔍 5. Checking Live Broker Status...");
  await new Promise((resolve) => setTimeout(resolve, 800));

  const sockPath = "/tmp/modcdp-broker.sock";
  if (existsSync(sockPath)) {
    try {
      const client = net.createConnection(sockPath, () => {
        client.write(JSON.stringify({ action: "status" }) + "\n");
      });
      client.on("data", (data) => {
        try {
          const status = JSON.parse(data.toString().trim());
          console.log("\n   📊 Live Connection Status:");
          console.log(`      • Main Chrome (29292): ${status.main.state === "READY" ? "🟢 CONNECTED" : "⚪ Waiting for extension..."}`);
          console.log(`      • Chrome Dev  (29293): ${status.dev.state === "READY" ? "🟢 CONNECTED" : "⚪ Waiting for extension..."}\n`);
        } catch {}
        client.end();
        rl.close();
      });
      client.on("error", () => {
        console.log("   ⚠️ Broker socket not reachable yet.");
        rl.close();
      });
    } catch {
      rl.close();
    }
  } else {
    console.log("   ⚠️ Broker socket initializing...");
    rl.close();
  }

  console.log("🎉 Setup complete! You're ready to automate Chrome with your AI agents.");
}

main().catch((err) => {
  console.error("Setup error:", err);
  rl.close();
});

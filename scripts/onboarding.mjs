#!/usr/bin/env node
// scripts/onboarding.mjs — Compatibility wrapper forwarding to scripts/onboard.mjs
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export * from "./onboard.mjs";

const isMainModule = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);

if (isMainModule) {
  const onboardScript = path.join(path.dirname(fileURLToPath(import.meta.url)), "onboard.mjs");

  const child = spawn(process.execPath, [onboardScript, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
}

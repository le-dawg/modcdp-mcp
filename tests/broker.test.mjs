// tests/broker.test.mjs — tests broker binary dual browser WS connections and IPC routing
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { WebSocket } from "ws";

const binPath = path.join(process.env.HOME, ".local", "bin", "modcdp-mcp");

test("Broker connects dual browsers, enforces handshake, routes commands over IPC", async () => {
  // Start broker process
  const child = spawn(binPath, ["broker"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Wait for socket to become available
  const sockPath = "/tmp/modcdp-broker.sock";
  let connected = false;
  for (let i = 0; i < 30; i++) {
    try {
      const s = net.createConnection(sockPath);
      await new Promise((resolve, reject) => {
        s.on("connect", () => { s.end(); resolve(); });
        s.on("error", reject);
      });
      connected = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  assert.ok(connected, "Broker Unix socket should be reachable");

  // Connect mock Main Chrome
  const mainWs = new WebSocket("ws://127.0.0.1:29292");
  await new Promise((r) => mainWs.on("open", r));
  mainWs.send(JSON.stringify({
    type: "hello",
    browser_tag: "main",
    extension_version: "0.2.0",
    session_nonce: 1001,
    build_hash: "hash-main",
  }));

  mainWs.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method === "Mod.getActiveTab") {
      mainWs.send(JSON.stringify({
        id: msg.id,
        result: { id: 101, title: "GitHub PR #42", url: "https://github.com/test", active: true },
      }));
    }
  });

  // Connect mock Chrome Dev
  const devWs = new WebSocket("ws://127.0.0.1:29293");
  await new Promise((r) => devWs.on("open", r));
  devWs.send(JSON.stringify({
    type: "hello",
    browser_tag: "dev",
    extension_version: "0.2.0",
    session_nonce: 2001,
    build_hash: "hash-dev",
  }));

  await new Promise((r) => setTimeout(r, 50));

  const sendIpc = (req) =>
    new Promise((resolve, reject) => {
      const client = net.createConnection(sockPath, () => {
        client.write(JSON.stringify(req) + "\n");
      });
      client.on("data", (data) => {
        client.end();
        resolve(JSON.parse(data.toString().trim()));
      });
      client.on("error", reject);
    });

  try {
    // Status check
    const status = await sendIpc({ action: "status" });
    assert.equal(status.main.state, "READY");
    assert.equal(status.dev.state, "READY");

    // Command dispatch to Main Chrome
    const mainResult = await sendIpc({
      action: "send",
      browser: "main",
      method: "Mod.getActiveTab",
      params: {},
    });
    assert.equal(mainResult.result.title, "GitHub PR #42");
  } finally {
    mainWs.close();
    devWs.close();
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((r) => child.on("exit", r));
    }
  }

});

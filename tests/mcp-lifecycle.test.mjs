// tests/mcp-lifecycle.test.mjs — MCP stdio lifecycle, initialize, tools/list, and tool call
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binPath = path.join(process.env.HOME, ".local", "bin", "modcdp-mcp");

test("MCP server lifecycle: initialize, notifications/initialized, tools/list, and tool call", async () => {
  const child = spawn(binPath, [], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let responseResolver = null;
  let stdoutBuffer = "";

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line.trim());
        if (responseResolver) {
          const resolve = responseResolver;
          responseResolver = null;
          resolve(json);
        }
      } catch (e) {
        // non-JSON log line
      }
    }
  });

  const sendRpc = (req) =>
    new Promise((resolve) => {
      responseResolver = resolve;
      child.stdin.write(JSON.stringify(req) + "\n");
    });

  // Give the embedded broker time to bind ports
  await new Promise((r) => setTimeout(r, 100));

  // Connect mock Main Chrome extension to port 29292
  const mainWs = new WebSocket("ws://127.0.0.1:29292");
  await new Promise((r) => mainWs.on("open", r));
  mainWs.send(
    JSON.stringify({
      type: "hello",
      browser_tag: "main",
      extension_version: "0.2.0",
      session_nonce: Date.now(),
      build_hash: "test-hash",
    })
  );

  // Mock handler for Mod.getActiveTab
  mainWs.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method === "Mod.getActiveTab") {
      mainWs.send(
        JSON.stringify({
          id: msg.id,
          result: { id: 42, title: "Test Active Tab", url: "https://example.com", windowId: 1, active: true },
        })
      );
    }
  });

  await new Promise((r) => setTimeout(r, 50));

  try {
    // 1. Initialize
    const initRes = await sendRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-harness", version: "1.0.0" },
      },
    });

    assert.equal(initRes.result.protocolVersion, "2024-11-05");
    assert.ok(initRes.result.capabilities.tools);
    assert.equal(initRes.result.serverInfo.name, "modcdp-mcp");

    // 2. Initialized notification
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      }) + "\n"
    );

    // 3. Tools list
    const listRes = await sendRpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });

    const toolNames = listRes.result.tools.map((t) => t.name);
    assert.ok(toolNames.includes("get_active_tab"));
    assert.ok(toolNames.includes("find_tabs_by_title"));
    assert.ok(toolNames.includes("focus_tab"));
    assert.ok(toolNames.includes("modcdp_eval"));
    assert.ok(toolNames.includes("eval_in_tab"));
    assert.ok(toolNames.includes("capture_active_tab_screenshot"));

    // 4. Tool call
    const callRes = await sendRpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "get_active_tab",
        arguments: { browser: "main" },
      },
    });

    assert.ok(callRes.result.content);
    assert.equal(callRes.result.content[0].type, "text");
    const tabInfo = JSON.parse(callRes.result.content[0].text);
    assert.equal(tabInfo.title, "Test Active Tab");
  } finally {
    child.stdin.end();
    mainWs.close();
    if (child.exitCode === null) {
      await new Promise((r) => child.on("exit", r));
    }
  }

});

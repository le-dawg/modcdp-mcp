// tests/e2e-verification.test.mjs — end-to-end multi-tool dual-browser MCP verification
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { WebSocket } from "ws";

const binPath = path.join(process.env.HOME, ".local", "bin", "modcdp-mcp");

test("End-to-End MCP & Dual-Browser Verification across all 6 tools", async () => {
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
      } catch {}
    }
  });

  const sendRpc = (req) =>
    new Promise((resolve) => {
      responseResolver = resolve;
      child.stdin.write(JSON.stringify(req) + "\n");
    });

  await new Promise((r) => setTimeout(r, 100));

  // Connect mock Main Chrome (port 29292)
  const mainWs = new WebSocket("ws://127.0.0.1:29292");
  await new Promise((r) => mainWs.on("open", r));
  mainWs.send(JSON.stringify({
    type: "hello",
    browser_tag: "main",
    extension_version: "0.2.0",
    session_nonce: Date.now(),
    build_hash: "e2e-main",
  }));

  // Connect mock Chrome Dev (port 29293)
  const devWs = new WebSocket("ws://127.0.0.1:29293");
  await new Promise((r) => devWs.on("open", r));
  devWs.send(JSON.stringify({
    type: "hello",
    browser_tag: "dev",
    extension_version: "0.2.0",
    session_nonce: Date.now() + 1,
    build_hash: "e2e-dev",
  }));

  const setupResponder = (ws, browserName) => {
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.method === "Mod.getActiveTab") {
        ws.send(JSON.stringify({
          id: msg.id,
          result: {
            id: browserName === "main" ? 101 : 202,
            title: browserName === "main" ? "GitHub Main" : "Linear Dev",
            url: browserName === "main" ? "https://github.com" : "https://linear.app",
            windowId: 1,
            active: true,
          },
        }));
      } else if (msg.method === "Mod.evaluate") {
        const expr = msg.params?.expression || "";
        if (expr.includes("captureVisibleTab")) {
          ws.send(JSON.stringify({
            id: msg.id,
            result: {
              format: "png",
              dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            },
          }));
        } else if (expr.includes("executeScript")) {
          ws.send(JSON.stringify({
            id: msg.id,
            result: "Page Heading Text",
          }));
        } else if (expr.includes("find_tabs") || expr.includes("regex.test")) {
          ws.send(JSON.stringify({
            id: msg.id,
            result: [
              { id: 301, title: "Kleinanzeigen Search", url: "https://kleinanzeigen.de", active: false },
            ],
          }));
        } else if (expr.includes("windows.update")) {
          ws.send(JSON.stringify({
            id: msg.id,
            result: { focused: true, tab_id: 301, title: "Kleinanzeigen Search" },
          }));
        } else {
          ws.send(JSON.stringify({
            id: msg.id,
            result: { evaluated: true, browser: browserName },
          }));
        }
      }
    });
  };

  setupResponder(mainWs, "main");
  setupResponder(devWs, "dev");

  await new Promise((r) => setTimeout(r, 60));

  try {
    // 1. initialize
    const initRes = await sendRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {} },
    });
    assert.equal(initRes.result.serverInfo.name, "modcdp-mcp");

    // 2. notifications/initialized
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n"
    );

    // 3. tools/list
    const listRes = await sendRpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    assert.equal(listRes.result.tools.length, 6);

    // 4. get_active_tab in Main Chrome
    const mainTabRes = await sendRpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_active_tab", arguments: { browser: "main" } },
    });
    const mainTab = JSON.parse(mainTabRes.result.content[0].text);
    assert.equal(mainTab.title, "GitHub Main");

    // 5. get_active_tab in Chrome Dev
    const devTabRes = await sendRpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "get_active_tab", arguments: { browser: "dev" } },
    });
    const devTab = JSON.parse(devTabRes.result.content[0].text);
    assert.equal(devTab.title, "Linear Dev");

    // 6. find_tabs_by_title
    const findRes = await sendRpc({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "find_tabs_by_title", arguments: { title_pattern: "Kleinanzeigen" } },
    });
    const foundTabs = JSON.parse(findRes.result.content[0].text);
    assert.equal(foundTabs[0].title, "Kleinanzeigen Search");

    // 7. focus_tab
    const focusRes = await sendRpc({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "focus_tab", arguments: { tab_id: 301 } },
    });
    const focusInfo = JSON.parse(focusRes.result.content[0].text);
    assert.equal(focusInfo.focused, true);

    // 8. eval_in_tab
    const evalTabRes = await sendRpc({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "eval_in_tab", arguments: { tab_id: 301, expression: "document.title" } },
    });
    const evalResult = JSON.parse(evalTabRes.result.content[0].text);
    assert.equal(evalResult, "Page Heading Text");

    // 9. capture_active_tab_screenshot
    const shotRes = await sendRpc({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "capture_active_tab_screenshot", arguments: { format: "png" } },
    });
    assert.equal(shotRes.result.content[0].type, "image");
    assert.equal(shotRes.result.content[0].mimeType, "image/png");
    assert.ok(shotRes.result.content[0].data.length > 20);

    // 10. Error handling: requesting non-existent browser
    const errRes = await sendRpc({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "get_active_tab", arguments: { browser: "firefox" } },
    });
    assert.equal(errRes.result.isError, true);
    assert.match(errRes.result.content[0].text, /BROWSER_UNAVAILABLE/i);
  } finally {
    child.stdin.end();
    mainWs.close();
    devWs.close();
    if (child.exitCode === null) {
      await new Promise((r) => child.on("exit", r));
    }
  }

});

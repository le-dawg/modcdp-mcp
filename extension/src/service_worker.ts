// service_worker.ts — ModCDP standalone bridge
// ONLY ReverseWSDownstreamTransport. No NATS. No NativeMessaging.
// MODCDP_BRIDGE_PORT is injected by build-extensions.mjs as a define.

import { ModCDPServer } from "./server/ModCDPServer.js";
import { ReverseWSDownstreamTransport } from "./transport/ReverseWSDownstreamTransport.js";

// Injected at build time: 29292 for main, 29293 for dev
declare const MODCDP_BRIDGE_PORT: number;

const BRIDGE_URL = `ws://127.0.0.1:${MODCDP_BRIDGE_PORT}`;
const OFFSCREEN_PORT_NAME = "modcdp-offscreen-keepalive";

const server = new ModCDPServer({
  downstream: new ReverseWSDownstreamTransport({
    downstream_reversews_url: BRIDGE_URL,
  }),
});

async function ensureOffscreen(): Promise<void> {
  try {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (!hasDoc) {
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL("pages/offscreen_keepalive.html"),
        reasons: ["WORKERS" as chrome.offscreen.Reason],
        justification: "Keep service worker alive for ModCDP MCP bridge.",
      });
    }
  } catch (e) {
    console.warn("[ModCDP] offscreen keepalive unavailable:", e);
  }
}

async function start(): Promise<void> {
  await ensureOffscreen();
  await server.start();
}

chrome.runtime.onStartup.addListener(() => void start());
chrome.runtime.onInstalled.addListener(() => void start());
chrome.tabs.onCreated.addListener(() => void start());

// Handle offscreen port disconnect — attempt recreation for self-healing
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== OFFSCREEN_PORT_NAME) return;
  port.onDisconnect.addListener(() => {
    console.warn("[ModCDP] offscreen port disconnected, attempting recreation");
    void ensureOffscreen();
  });
});

void start();

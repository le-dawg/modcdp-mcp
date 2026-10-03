// offscreen_keepalive.ts — keeps service worker alive via port heartbeat
const port = chrome.runtime.connect({ name: "modcdp-offscreen-keepalive" });

// Send periodic heartbeat to prevent port from being GC'd
setInterval(() => {
  port.postMessage({ type: "keepalive" });
}, 5_000);

port.onDisconnect.addListener(() => {
  console.warn("[ModCDP offscreen] port disconnected");
});

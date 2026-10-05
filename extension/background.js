import { CONVEX_URL } from "./config.js";

// Anonymous, per-install identity: one vote per episode per install, no login.
async function getDeviceId() {
  const { deviceId } = await chrome.storage.local.get("deviceId");
  if (deviceId) return deviceId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ deviceId: id });
  return id;
}

async function convex(kind, path, args) {
  const res = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const body = await res.json();
  if (body.status === "success") return body.value;
  const data = body.errorData;
  if (data?.kind === "RateLimited") throw new Error("Calma! Demasiados votos, tenta daqui a pouco.");
  throw new Error(typeof data === "string" ? data : "Erro no servidor de notas.");
}

async function handle(msg) {
  const deviceId = await getDeviceId();
  switch (msg.type) {
    case "stats":
      return convex("query", "ratings:getStats", { contentIds: msg.contentIds, deviceId });
    case "vote":
      return convex("action", "ratings:vote", {
        deviceId,
        contentId: msg.contentId,
        ...(msg.score !== undefined && { score: msg.score }),
        ...(msg.moments !== undefined && { moments: msg.moments }),
      });
    default:
      throw new Error(`Unknown message: ${msg.type}`);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg).then(
    (value) => sendResponse({ value }),
    (err) => sendResponse({ error: err.message ?? String(err) }),
  );
  return true;
});

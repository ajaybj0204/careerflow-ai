// Background worker: the only place that talks to CareerFlow (with your extension token),
// runs the Alt+Shift+F shortcut, and turns the automatic Fill button on for job sites you allowed.
import { JOB_SITES } from "./sites.js";
import { fillTab } from "./fill-tab.js";

const cache = new Map(); // path -> { at, data }
const CACHE_MS = { autofill: 2 * 60 * 1000, resume: 10 * 60 * 1000 };

async function cfg() {
  const v = await chrome.storage.local.get(["appUrl", "token"]);
  if (!v.appUrl || !v.token) throw new Error("Connect the extension first: open its Settings and paste your CareerFlow token.");
  return v;
}

async function api(path, method = "GET", body) {
  const ttl = method === "GET" ? CACHE_MS[path] : 0;
  const hit = ttl && cache.get(path);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  const { appUrl, token } = await cfg();
  const res = await fetch(`${appUrl}/api/extension/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `CareerFlow request failed (${res.status})`);
  if (ttl) cache.set(path, { at: Date.now(), data });
  if (path === "save-answers") cache.delete("autofill");
  return data;
}

const ALLOWED_PATHS = new Set(["autofill", "resume", "draft-answer", "save-answers", "applied", "lookup"]);

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== "cf-api") return false;
  if (!ALLOWED_PATHS.has(String(msg.path).split("?")[0])) {
    reply({ ok: false, error: "Not allowed" });
    return false;
  }
  api(msg.path, msg.method, msg.body)
    .then((data) => reply({ ok: true, data }))
    .catch((e) => reply({ ok: false, error: e.message }));
  return true; // async reply
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "fill-form" || !tab?.id) return;
  try {
    const r = await fillTab(tab.id);
    await chrome.action.setBadgeBackgroundColor({ color: "#7c3aed", tabId: tab.id });
    await chrome.action.setBadgeText({ text: r.errors.length && !r.filled ? "!" : String(r.filled), tabId: tab.id });
  } catch (e) {
    await chrome.action.setBadgeText({ text: "!", tabId: tab.id });
    console.warn("CareerFlow fill failed:", e.message);
  }
});

/** Registers the automatic Fill button for the job sites you have allowed (and only those). */
async function syncAutoScripts() {
  const { origins = [] } = await chrome.permissions.getAll();
  const allowed = JOB_SITES.filter((s) => origins.includes(s));
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ["cf-auto"] });
  } catch {}
  if (!allowed.length) return;
  await chrome.scripting.registerContentScripts([{ id: "cf-auto", matches: allowed, js: ["fieldmatch.js", "filler.js"], allFrames: true, runAt: "document_idle", persistAcrossSessions: true }]);
}

chrome.runtime.onInstalled.addListener(syncAutoScripts);
chrome.runtime.onStartup.addListener(syncAutoScripts);
chrome.permissions.onAdded.addListener(syncAutoScripts);
chrome.permissions.onRemoved.addListener(syncAutoScripts);

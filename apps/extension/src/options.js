import { normalizeAppUrl } from "./lib.js";

const form = document.getElementById("form");
const status = document.getElementById("status");

chrome.storage.local.get(["appUrl", "token"]).then((v) => {
  if (v.appUrl) form.elements.appUrl.value = v.appUrl;
  if (v.token) form.elements.token.value = v.token;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  status.textContent = "";
  try {
    const appUrl = normalizeAppUrl(form.elements.appUrl.value);
    const token = form.elements.token.value.trim();
    // Ask for access to exactly this origin, nothing else
    const granted = await chrome.permissions.request({ origins: [`${appUrl}/*`] });
    if (!granted) throw new Error("Permission to contact CareerFlow was not granted.");
    const res = await fetch(`${appUrl}/api/extension/me`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Connection failed (${res.status})`);
    await chrome.storage.local.set({ appUrl, token });
    status.textContent = "Connected. You can close this tab.";
    status.className = "ok";
  } catch (err) {
    status.textContent = err.message;
    status.className = "error";
  }
});

import { normalizeAppUrl } from "./lib.js";
import { JOB_SITES } from "./sites.js";

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

// Autofill preferences (all on by default)
for (const id of ["aiDrafts", "autoTrack", "autoLearn"]) {
  const box = document.getElementById(id);
  chrome.storage.local.get(id).then((v) => (box.checked = v[id] !== false));
  box.addEventListener("change", () => chrome.storage.local.set({ [id]: box.checked }));
}

const sitesBtn = document.getElementById("sites");
const sitesStatus = document.getElementById("sitesStatus");
async function showSites() {
  const has = await chrome.permissions.contains({ origins: JOB_SITES });
  sitesBtn.textContent = has ? "Turn off on job sites" : "Allow on job sites";
  sitesStatus.textContent = has ? "On: the Fill button appears on application forms on these sites." : "Off.";
  return has;
}
sitesBtn.addEventListener("click", async () => {
  const has = await chrome.permissions.contains({ origins: JOB_SITES });
  if (has) await chrome.permissions.remove({ origins: JOB_SITES });
  else await chrome.permissions.request({ origins: JOB_SITES });
  await showSites();
});
showSites();

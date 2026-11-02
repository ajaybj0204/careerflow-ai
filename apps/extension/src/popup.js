import { buildJob } from "./lib.js";

const $ = (id) => document.getElementById(id);
let cfg = null;
let tab = null;
let savedId = null;

function showError(msg) {
  $("error").textContent = msg;
  $("error").hidden = !msg;
}

async function api(path, init = {}) {
  const res = await fetch(`${cfg.appUrl}/api/extension/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** Runs in the page only when the user clicks Capture (activeTab). Returns raw page data; no tracking. */
function readPage() {
  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent || "").slice(0, 20);
  const meta = (p) => document.querySelector(`meta[property="${p}"]`)?.getAttribute("content") || "";
  const main = document.querySelector("main, [role=main], article") || document.body;
  return {
    url: location.href,
    title: document.title,
    h1: document.querySelector("h1")?.innerText?.trim() || "",
    ogTitle: meta("og:title"),
    siteName: meta("og:site_name"),
    selection: String(window.getSelection() || "").trim(),
    mainText: (main?.innerText || "").slice(0, 30000),
    jsonLd,
  };
}

function renderAnswers(data) {
  const box = $("answers");
  box.innerHTML = "";
  const items = [
    ...Object.entries(data.profile || {})
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => ({ q: k.replace(/([A-Z])/g, " $1").toLowerCase(), a: String(v) })),
    ...(data.answers || []).map((x) => ({ q: x.question, a: x.answer })),
  ];
  for (const it of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "answer";
    b.innerHTML = `<span class="q"></span><span class="a"></span>`;
    b.querySelector(".q").textContent = it.q;
    b.querySelector(".a").textContent = it.a.length > 90 ? `${it.a.slice(0, 90)}…` : it.a;
    b.addEventListener("click", async () => {
      await navigator.clipboard.writeText(it.a);
      b.classList.add("copied");
      setTimeout(() => b.classList.remove("copied"), 1200);
    });
    box.appendChild(b);
  }
  if (!items.length) box.textContent = "No saved answers yet.";
}

async function init() {
  cfg = await chrome.storage.local.get(["appUrl", "token"]);
  if (!cfg.appUrl || !cfg.token) {
    $("setup").hidden = false;
    return;
  }
  $("main").hidden = false;
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    if (tab?.url?.startsWith("http")) {
      const found = await api(`lookup?url=${encodeURIComponent(tab.url.split("#")[0])}`);
      if (found.application) {
        savedId = found.application.id;
        $("existing").hidden = false;
        $("existing").textContent = `Already saved: ${found.application.role_title} at ${found.application.company} (${found.application.status}).`;
        $("open").href = found.workspaceUrl;
        $("saved").hidden = false;
        $("savedMsg").textContent = "";
        $("capture").hidden = true;
      }
    }
    renderAnswers(await api("answers"));
  } catch (e) {
    showError(e.message);
  }
}

$("capture").addEventListener("click", async () => {
  showError("");
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPage });
    const job = buildJob(result);
    const f = $("form");
    for (const k of ["roleTitle", "company", "location", "portal", "description"]) f.elements[k].value = job[k] || "";
    f.dataset.url = job.url;
    f.dataset.externalJobId = job.externalJobId || "";
    $("source").textContent = `Read from ${job.source}. Check the details before saving.`;
    f.hidden = false;
    $("capture").hidden = true;
  } catch (e) {
    showError(`Could not read this page: ${e.message}`);
  }
});

$("form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  showError("");
  const f = ev.currentTarget;
  try {
    const r = await api("save-job", {
      method: "POST",
      body: JSON.stringify({
        roleTitle: f.elements.roleTitle.value,
        company: f.elements.company.value,
        location: f.elements.location.value || null,
        portal: f.elements.portal.value || null,
        description: f.elements.description.value || null,
        url: f.dataset.url,
        externalJobId: f.dataset.externalJobId || null,
      }),
    });
    savedId = r.id;
    f.hidden = true;
    $("saved").hidden = false;
    $("savedMsg").textContent = r.duplicate ? "This job was already saved — no duplicate created." : "Saved to CareerFlow.";
    $("open").href = r.workspaceUrl;
  } catch (e) {
    showError(e.message);
  }
});

$("applied").addEventListener("click", async () => {
  if (!savedId) return;
  if (!confirm("Confirm you have submitted this application on the job site?")) return;
  try {
    await api("mark-applied", { method: "POST", body: JSON.stringify({ id: savedId, confirmed: true }) });
    $("savedMsg").textContent = "Marked as applied.";
    $("applied").disabled = true;
  } catch (e) {
    showError(e.message);
  }
});

init();

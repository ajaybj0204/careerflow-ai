// CareerFlow form filler. Runs inside a job application page (injected when you click "Fill this
// application", press Alt+Shift+F, or automatically on job sites you allowed).
// It fills fields from your CareerFlow profile, marks what it did, and NEVER submits the form.
(function () {
  if (window.__cfFiller) return;
  const M = globalThis.CFMatch;
  if (!M) return;

  const STATE = { filled: "#16a34a", drafted: "#ca8a04", needs: "#ea580c" };
  let lastReport = null;
  let job = null;
  const learned = new Map(); // question -> answer the user typed
  let learnedSaved = false;
  let watchingSubmit = false;
  let busy = false;

  // ───────────── talking to CareerFlow (through the extension's background worker) ─────────────
  function api(path, method = "GET", body) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: "cf-api", path, method, body }, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!res) return reject(new Error("No response from the extension"));
          if (!res.ok) return reject(new Error(res.error || "Request failed"));
          resolve(res.data);
        });
      } catch (e) {
        reject(new Error("The extension was reloaded. Refresh this page and try again."));
      }
    });
  }
  const settings = () =>
    new Promise((r) => chrome.storage.local.get(["aiDrafts", "autoTrack", "autoLearn"], (v) => r({ aiDrafts: v.aiDrafts !== false, autoTrack: v.autoTrack !== false, autoLearn: v.autoLearn !== false })));

  // ───────────── reading the page ─────────────
  const clean = (s) =>
    String(s || "")
      .replace(/\s+/g, " ")
      .replace(/\s*\*\s*/g, " ")
      .trim()
      .slice(0, 300);

  function visible(el) {
    if (!el.isConnected) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    // file inputs are often hidden behind a styled button: allow them
    if (el.type === "file") return true;
    return r.width > 0 && r.height > 0;
  }

  function textOf(node) {
    if (!node) return "";
    const c = node.cloneNode(true);
    c.querySelectorAll("input, select, textarea, option, button, svg, style, script, [aria-hidden=true]").forEach((x) => x.remove());
    return clean(c.textContent);
  }

  const CONTAINERS = "fieldset, [role=radiogroup], [role=group], .field, .form-field, .form-group, .application-question, .application-field, [data-automation-id^=formField], [class*=question], [class*=Question], [class*=field], [class*=Field], li, .row";

  function labelFor(el) {
    if (el.labels && el.labels.length) {
      const t = clean([...el.labels].map(textOf).join(" "));
      if (t) return t;
    }
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = clean(by.split(/\s+/).map((id) => textOf(document.getElementById(id))).join(" "));
      if (t) return t;
    }
    if (el.getAttribute("aria-label")) return clean(el.getAttribute("aria-label"));
    // Nearest container with a label/legend/heading that is not one of the inputs
    let node = el.parentElement;
    for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
      const lab = node.querySelector(":scope > label, :scope > legend, :scope > .application-label, :scope > [class*=label], :scope > [class*=Label], :scope > h3, :scope > h4, :scope > p, :scope > span");
      if (lab && !lab.contains(el)) {
        const t = textOf(lab);
        if (t && t.length > 1) return t;
      }
      if (node.matches && node.matches(CONTAINERS)) {
        const t = textOf(node);
        if (t && t.length > 1 && t.length < 300) return t;
      }
    }
    if (el.placeholder) return clean(el.placeholder);
    return "";
  }

  function describe(el) {
    return {
      label: labelFor(el),
      name: el.getAttribute("name") || "",
      id: el.id || "",
      placeholder: el.getAttribute("placeholder") || "",
      autocomplete: el.getAttribute("autocomplete") || "",
      type: (el.getAttribute("type") || el.tagName).toLowerCase(),
      tag: el.tagName.toLowerCase(),
      inputmode: el.getAttribute("inputmode") || "",
      automationId: el.getAttribute("data-automation-id") || el.closest("[data-automation-id]")?.getAttribute("data-automation-id") || "",
      maxLength: el.maxLength > 0 ? el.maxLength : null,
      required: el.required || el.getAttribute("aria-required") === "true" || /\*/.test(el.labels?.[0]?.textContent || ""),
    };
  }

  /** All fillable fields, with radio buttons grouped into one question. */
  function collectFields(root = document) {
    const out = [];
    const seenRadio = new Set();
    const els = root.querySelectorAll("input, textarea, select, [contenteditable=true][role=textbox]");
    for (const el of els) {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image", "password", "search"].includes(type)) continue;
      if (el.disabled || el.readOnly) continue;
      if (el.closest("[data-cf-panel]")) continue;
      if (/captcha|recaptcha|hcaptcha|g-recaptcha/i.test(`${el.name} ${el.id} ${el.className}`)) continue;
      if (!visible(el)) continue;
      if (type === "radio") {
        const key = el.name || el.closest(CONTAINERS)?.textContent?.slice(0, 50) || Math.random();
        if (seenRadio.has(key)) continue;
        seenRadio.add(key);
        const radios = el.name ? [...root.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`)] : [el];
        const box = el.closest("fieldset, [role=radiogroup], " + CONTAINERS) || el.parentElement;
        const legend = box?.querySelector("legend, [class*=label], [class*=Label], label:not(:has(input)), p, span");
        const optionTexts = radios.map(radioText);
        let q = legend ? textOf(legend) : "";
        if (!q || optionTexts.includes(q)) {
          q = textOf(box);
          for (const t of optionTexts.filter(Boolean)) q = q.split(t).join(" ");
          q = clean(q);
        }
        out.push({ kind: "radio", el: box || el, radios, desc: { ...describe(el), label: q, type: "radio" } });
        continue;
      }
      const kind = el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : el.isContentEditable ? "editable" : type === "checkbox" ? "checkbox" : type === "file" ? "file" : "text";
      out.push({ kind, el, desc: describe(el) });
    }
    return out;
  }

  function radioText(r) {
    return clean((r.labels && r.labels[0] && textOf(r.labels[0])) || r.getAttribute("aria-label") || r.nextSibling?.textContent || r.value);
  }

  function hasValue(f) {
    switch (f.kind) {
      case "select": {
        const o = f.el.options[f.el.selectedIndex];
        return !!o && !!o.value && !/^(select|choose|please|--)/i.test(o.text.trim());
      }
      case "radio":
        return f.radios.some((r) => r.checked);
      case "checkbox":
        return f.el.checked;
      case "file":
        return f.el.files && f.el.files.length > 0;
      case "editable":
        return !!f.el.textContent.trim();
      default:
        return !!String(f.el.value || "").trim();
    }
  }

  // ───────────── writing values the way a person would (works with React/Vue forms) ─────────────
  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    el.focus({ preventScroll: true });
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function fitText(f, value) {
    let v = String(value);
    if (f.desc.type === "number") v = (v.match(/\d+(\.\d+)?/) || [""])[0];
    if (f.desc.type === "url" && v && !/^https?:\/\//i.test(v)) v = `https://${v}`;
    if (f.desc.maxLength && v.length > f.desc.maxLength) v = v.slice(0, f.desc.maxLength);
    return v;
  }

  function apply(f, value, key) {
    if (value === null || value === undefined || value === "") return false;
    if (f.kind === "text" || f.kind === "textarea") {
      setValue(f.el, fitText(f, value));
      return true;
    }
    if (f.kind === "editable") {
      f.el.focus();
      f.el.textContent = String(value);
      f.el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      return true;
    }
    if (f.kind === "select") {
      const opts = [...f.el.options].map((o) => ({ text: o.text, value: o.value }));
      const i = M.chooseOption(opts, value, key);
      if (i < 0) return false;
      setValue(f.el, f.el.options[i].value);
      return true;
    }
    if (f.kind === "radio") {
      const i = M.chooseOption(f.radios.map((r) => ({ text: radioText(r), value: r.value })), value, key);
      if (i < 0) return false;
      if (!f.radios[i].checked) f.radios[i].click();
      return true;
    }
    if (f.kind === "checkbox") {
      if (/^(yes|true|agree|i agree|checked)$/i.test(String(value).trim()) && !f.el.checked) {
        f.el.click();
        return true;
      }
      return false;
    }
    return false;
  }

  let resumeCache = null;
  async function attachResume(f) {
    if (!resumeCache) resumeCache = await api("resume");
    const bytes = Uint8Array.from(atob(resumeCache.base64), (c) => c.charCodeAt(0));
    const file = new File([bytes], resumeCache.fileName, { type: resumeCache.mime });
    const accept = (f.el.getAttribute("accept") || "").toLowerCase();
    if (accept && !accept.split(",").some((a) => { a = a.trim(); return a === file.type || (a.startsWith(".") && file.name.toLowerCase().endsWith(a)) || (a.endsWith("/*") && file.type.startsWith(a.slice(0, -1))); })) {
      throw new Error(`This upload accepts ${accept}; your resume is ${file.name}.`);
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    f.el.files = dt.files;
    f.el.dispatchEvent(new Event("input", { bubbles: true }));
    f.el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  // ───────────── marking fields ─────────────
  function ensureStyles() {
    if (document.getElementById("cf-fill-style")) return;
    const s = document.createElement("style");
    s.id = "cf-fill-style";
    s.textContent = `[data-cf-state]{outline-offset:2px!important;transition:outline-color .3s}
[data-cf-state=filled]{outline:2px solid ${STATE.filled}!important}
[data-cf-state=drafted]{outline:2px solid ${STATE.drafted}!important;background-color:rgba(250,204,21,.08)!important}
[data-cf-state=needs]{outline:2px dashed ${STATE.needs}!important}`;
    document.documentElement.appendChild(s);
  }
  function mark(f, state, note) {
    const target = f.kind === "radio" ? f.el : f.kind === "file" ? f.el.closest(CONTAINERS) || f.el.parentElement || f.el : f.el;
    if (!target) return;
    target.setAttribute("data-cf-state", state);
    if (note) target.setAttribute("title", `CareerFlow: ${note}`);
  }

  // ───────────── job details for AI drafts and tracking ─────────────
  function readJob() {
    let ld = null;
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent || "");
        const items = Array.isArray(data) ? data : data["@graph"] || [data];
        ld = items.find((x) => [].concat(x && x["@type"]).includes("JobPosting")) || ld;
      } catch {}
    }
    const meta = (p) => document.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.getAttribute("content") || "";
    const host = location.hostname.replace(/^www\./, "");
    const title = ld?.title || document.querySelector("h1, .app-title, .posting-headline h2, [data-automation-id=jobPostingHeader]")?.textContent?.trim() || meta("og:title") || document.title;
    const org = ld?.hiringOrganization;
    // Greenhouse/Lever/Workday put the company in the URL path or subdomain
    const pathCompany = /greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com/.test(host) ? location.pathname.split("/").filter(Boolean)[0] : /myworkdayjobs\.com|keka\.com|darwinbox\.in|zohorecruit|freshteam|recruitee|bamboohr|teamtailor/.test(host) ? host.split(".")[0] : "";
    const company =
      (typeof org === "string" ? org : org?.name) ||
      document.querySelector(".company-name, [class*=companyName], .posting-headline .company")?.textContent?.trim() ||
      meta("og:site_name") ||
      (pathCompany ? pathCompany.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "") ||
      host.split(".").slice(-2, -1)[0];
    const descEl = document.querySelector("#content, .job-description, [class*=jobDescription], [class*=job-description], .posting-page .section-wrapper, [data-automation-id=jobPostingDescription], main, article");
    const description = (ld?.description ? String(ld.description).replace(/<[^>]+>/g, " ") : descEl?.innerText || "").replace(/\s+/g, " ").slice(0, 8000);
    const roleTitle = String(title).split(/\s+[|\-–]\s+/)[0].replace(/^apply (for|to)\s+/i, "").trim().slice(0, 200);
    return { company: String(company || "Unknown company").trim().slice(0, 200), roleTitle: roleTitle || "Unknown role", url: location.href.split("#")[0].slice(0, 2000), description, portal: host };
  }

  // ───────────── the panel (shadow DOM so the page's styles can't break it) ─────────────
  let panel = null;
  function ui() {
    if (window.top !== window && innerWidth < 420) return null; // tiny iframes: no panel
    if (panel) return panel;
    const host = document.createElement("div");
    host.setAttribute("data-cf-panel", "");
    host.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483646;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      :host{all:initial}
      .card{font:13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#15122b;background:#fff;border:1px solid #e8e5f2;border-radius:16px;box-shadow:0 18px 40px -12px rgba(76,29,149,.35);width:300px;padding:12px 14px;animation:pop .35s cubic-bezier(.34,1.56,.64,1)}
      @keyframes pop{from{opacity:0;transform:translateY(8px) scale(.96)}}
      .top{display:flex;align-items:center;gap:8px;font-weight:700}
      .logo{width:24px;height:24px;filter:drop-shadow(0 3px 8px rgba(168,85,247,.4))}
      .x{margin-left:auto;border:0;background:none;font-size:16px;cursor:pointer;color:#8a85a3}
      .msg{margin:8px 0 0;color:#4d4866}
      .row{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
      button.b{border:0;border-radius:10px;padding:8px 12px;font-weight:600;cursor:pointer;font-size:12.5px}
      .p{color:#fff;background:linear-gradient(120deg,#6366f1,#a855f7 55%,#ec4899)}
      .s{background:#f3f1fa;color:#15122b}
      .legend{display:flex;gap:10px;margin-top:8px;font-size:11.5px;color:#4d4866}
      .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
      a{color:#7c3aed}
      .ok{color:#15803d;font-weight:600}
      .err{color:#be123c}
    </style>
    <div class="card" role="dialog" aria-label="CareerFlow autofill">
      <div class="top"><svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="cfg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#6366F1"/><stop offset=".55" stop-color="#A855F7"/><stop offset="1" stop-color="#EC4899"/></linearGradient></defs><rect width="48" height="48" rx="14" fill="url(#cfg)"/><path d="M33.2 15.6A12 12 0 1 0 33.2 32.4" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/><path d="M19 28.5l5-5 3.5 3L37 17" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M31.5 16.2H37.6V22.3" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>CareerFlow <button class="x" title="Close" aria-label="Close">×</button></div>
      <p class="msg" id="msg">This looks like an application form.</p>
      <div class="legend" id="legend" hidden><span><i class="dot" style="background:${STATE.filled}"></i>Filled</span><span><i class="dot" style="background:${STATE.drafted}"></i>AI draft – check</span><span><i class="dot" style="background:${STATE.needs}"></i>You</span></div>
      <div class="row" id="actions"><button class="b p" id="fill">Fill with CareerFlow</button></div>
      <div class="row" id="extra"></div>
    </div>`;
    root.querySelector(".x").onclick = () => {
      host.remove();
      panel = null;
    };
    root.getElementById("fill").onclick = () => fill({ source: "panel" });
    document.documentElement.appendChild(host);
    panel = { host, root, msg: (h, cls) => ((root.getElementById("msg").innerHTML = h), (root.getElementById("msg").className = `msg ${cls || ""}`)), extra: root.getElementById("extra"), actions: root.getElementById("actions"), legend: root.getElementById("legend") };
    return panel;
  }

  function button(label, primary, onClick) {
    const b = document.createElement("button");
    b.className = `b ${primary ? "p" : "s"}`;
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }

  // ───────────── the fill ─────────────
  async function fill(opts = {}) {
    if (busy) return lastReport;
    busy = true;
    const p = ui();
    try {
      p?.msg("Filling from your CareerFlow profile…");
      const [data, prefs] = await Promise.all([api("autofill"), settings()]);
      ensureStyles();
      job = job || readJob();
      const fields = collectFields();
      const report = { total: fields.length, filled: 0, drafted: 0, needs: 0, already: 0, resume: false, notes: [], missing: data.missing || [] };
      const openQuestions = [];
      for (const f of fields) {
        if (hasValue(f)) {
          report.already++;
          continue;
        }
        const key = M.classifyField(f.desc);
        if (key === "sensitive") {
          mark(f, "needs", "personal question: please answer yourself");
          report.needs++;
          continue;
        }
        if (key === "skip") continue;
        if (f.kind === "file") {
          if (key === "resume" && data.resume?.available) {
            try {
              await attachResume(f);
              mark(f, "filled", "resume attached");
              report.filled++;
              report.resume = true;
            } catch (e) {
              mark(f, "needs", e.message);
              report.needs++;
              report.notes.push(e.message);
            }
          } else {
            mark(f, "needs", key === "coverLetter" ? "cover letter: attach if you want" : "upload this yourself");
            if (f.desc.required) report.needs++;
          }
          continue;
        }
        let value = key ? M.valueFor(key, data, f.desc) : null;
        if (value === null || value === undefined || value === "") value = M.matchSavedAnswer(f.desc.label, data.answers);
        if (value !== null && value !== undefined && value !== "" && apply(f, value, key)) {
          mark(f, "filled", key ? `from your profile (${key})` : "from your saved answers");
          report.filled++;
          continue;
        }
        if ((f.kind === "textarea" || f.kind === "text" || f.kind === "editable") && M.isOpenQuestion(f.desc) && prefs.aiDrafts) {
          openQuestions.push(f);
          continue;
        }
        if (f.desc.label || f.desc.required) {
          mark(f, "needs", key && !value ? "not in your CareerFlow profile yet" : "answer this yourself");
          report.needs++;
        }
        watchForLearning(f);
      }
      // AI drafts for open questions, one by one, so you see progress
      let n = 0;
      for (const f of openQuestions.slice(0, 6)) {
        n++;
        p?.msg(`Drafting answer ${n} of ${Math.min(openQuestions.length, 6)} with AI…`);
        try {
          const r = await api("draft-answer", "POST", { question: f.desc.label, charLimit: f.desc.maxLength || null, job: { company: job.company, roleTitle: job.roleTitle, description: job.description } });
          if (r.answer && apply(f, r.answer, null)) {
            mark(f, "drafted", r.missingFacts?.length ? `AI draft. Missing from profile: ${r.missingFacts.join("; ")}` : "AI draft from your profile: read and edit before submitting");
            report.drafted++;
          } else {
            mark(f, "needs", r.missingFacts?.join("; ") || "answer this yourself");
            report.needs++;
          }
        } catch (e) {
          mark(f, "needs", "AI draft unavailable: answer this yourself");
          report.needs++;
          report.notes.push(e.message);
        }
        watchForLearning(f);
      }
      for (const f of openQuestions.slice(6)) {
        mark(f, "needs", "answer this yourself");
        report.needs++;
        watchForLearning(f);
      }
      lastReport = report;
      watchSubmit(prefs);
      if (p) {
        p.legend.hidden = false;
        const parts = [`<b>${report.filled}</b> filled`];
        if (report.drafted) parts.push(`<b>${report.drafted}</b> AI drafts to check`);
        if (report.needs) parts.push(`<b>${report.needs}</b> for you`);
        p.msg(`${parts.join(" · ")}. Review everything, then submit yourself.${report.missing.length ? `<br><small>Add to your profile to fill more: ${report.missing.join(", ")}</small>` : ""}`);
        p.root.getElementById("fill").textContent = "Fill again";
      }
      return report;
    } catch (e) {
      p?.msg(e.message, "err");
      return { error: e.message };
    } finally {
      busy = false;
    }
  }

  // ───────────── learning answers you type ─────────────
  function watchForLearning(f) {
    const handler = () => {
      if (!f.desc.label || f.desc.label.length < 3 || M.SENSITIVE.test(f.desc.label)) return;
      let answer = "";
      if (f.kind === "select") answer = f.el.options[f.el.selectedIndex]?.text?.trim() || "";
      else if (f.kind === "radio") answer = radioText(f.radios.find((r) => r.checked) || {}) || "";
      else if (f.kind === "checkbox") answer = f.el.checked ? "Yes" : "No";
      else if (f.kind === "editable") answer = f.el.textContent.trim();
      else answer = String(f.el.value || "").trim();
      if (!answer || /^(select|choose)/i.test(answer)) {
        learned.delete(f.desc.label);
      } else {
        learned.set(f.desc.label, answer);
        const target = f.kind === "radio" ? f.el : f.el;
        if (target.getAttribute("data-cf-state") === "needs") target.removeAttribute("data-cf-state");
      }
      offerToRemember();
    };
    const targets = f.kind === "radio" ? f.radios : [f.el];
    targets.forEach((t) => t.addEventListener("change", handler));
    if (f.kind === "textarea" || f.kind === "text") f.el.addEventListener("blur", handler);
  }

  function offerToRemember() {
    const p = ui();
    if (!p || !learned.size || learnedSaved) return;
    p.extra.innerHTML = "";
    p.extra.appendChild(
      button(`Remember ${learned.size} new answer${learned.size > 1 ? "s" : ""} for next time`, false, async (ev) => {
        ev.target.disabled = true;
        await saveLearned();
        ev.target.textContent = "Saved to CareerFlow ✓";
      }),
    );
  }

  async function saveLearned() {
    if (!learned.size || learnedSaved) return;
    const items = [...learned].map(([question, answer]) => ({ question, answer }));
    await api("save-answers", "POST", { items });
    learnedSaved = true;
  }

  // ───────────── noticing a successful submission ─────────────
  function watchSubmit(prefs) {
    if (watchingSubmit) return;
    watchingSubmit = true;
    const onSubmit = () => {
      job = job || readJob();
      try {
        sessionStorage.setItem("cf-pending-submit", JSON.stringify({ job, at: Date.now() }));
      } catch {}
      if (prefs.autoLearn) saveLearned().catch(() => {});
      waitForConfirmation(prefs);
    };
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener(
      "click",
      (e) => {
        const b = e.target.closest && e.target.closest("button, input[type=submit], [role=button], a.button, a.btn");
        if (!b) return;
        const t = clean(b.innerText || b.value || b.getAttribute("aria-label") || "");
        if (M.SUBMIT_TEXT.test(t) && !M.NOT_SUBMIT.test(t)) onSubmit();
      },
      true,
    );
  }

  let confirmTimer = null;
  function waitForConfirmation(prefs) {
    clearInterval(confirmTimer);
    const started = Date.now();
    const startUrl = location.href;
    confirmTimer = setInterval(async () => {
      const text = document.body?.innerText?.slice(0, 20000) || "";
      if (M.CONFIRMATION.test(text) && (location.href !== startUrl || collectFields().length < 3 || Date.now() - started > 1500)) {
        clearInterval(confirmTimer);
        await submitted(prefs, true);
      } else if (Date.now() - started > 25000) {
        clearInterval(confirmTimer);
        askIfSubmitted();
      }
    }, 1000);
  }

  async function submitted(prefs, confirmed) {
    const key = `cf-tracked:${(job || readJob()).url}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {}
    const p = ui();
    if (!prefs.autoTrack && confirmed) return askIfSubmitted("We saw a confirmation message.");
    try {
      const r = await api("applied", "POST", job || readJob());
      try {
        sessionStorage.setItem(key, "1");
        sessionStorage.removeItem("cf-pending-submit");
      } catch {}
      p?.msg(`<span class="ok">Tracked in CareerFlow as Applied ✓</span><br>${escapeHtml((job || readJob()).roleTitle)} at ${escapeHtml((job || readJob()).company)}. <a href="${r.workspaceUrl}" target="_blank" rel="noopener">Open</a>`);
      p && (p.actions.innerHTML = "");
    } catch (e) {
      p?.msg(`Could not update CareerFlow: ${escapeHtml(e.message)}`, "err");
    }
  }

  function askIfSubmitted(prefix) {
    const p = ui();
    if (!p) return;
    p.msg(`${prefix ? prefix + " " : ""}Did your application go through?`);
    p.extra.innerHTML = "";
    p.extra.appendChild(button("Yes, mark as Applied", true, () => submitted({ autoTrack: true }, false)));
    p.extra.appendChild(button("Not yet", false, () => (p.extra.innerHTML = "")));
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ───────────── start-up ─────────────
  /** A page counts as an application form when it has a resume upload or several contact fields. */
  function looksLikeApplication() {
    const fields = collectFields();
    let score = 0;
    for (const f of fields) {
      const k = M.classifyField(f.desc);
      if (k === "resume") score += 3;
      else if (["email", "phone", "firstName", "lastName", "fullName", "linkedin"].includes(k)) score += 1;
    }
    return score >= 3;
  }

  async function resumePendingSubmit() {
    let pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem("cf-pending-submit") || "null");
    } catch {}
    if (!pending || Date.now() - pending.at > 5 * 60 * 1000) return;
    job = pending.job;
    const prefs = await settings();
    if (M.CONFIRMATION.test(document.body?.innerText || "")) submitted(prefs, true);
    else waitForConfirmation(prefs);
  }

  let offered = false;
  function maybeOffer() {
    if (offered || !looksLikeApplication()) return;
    offered = true;
    ui();
  }

  window.__cfFiller = { fill, report: () => lastReport, readJob, collectFields };

  // Automatic mode (job sites you allowed): offer the Fill button when a form appears.
  // Multi-step forms (e.g. Workday) render steps without reloading, so keep watching.
  if (window.__cfAuto !== false) {
    resumePendingSubmit();
    maybeOffer();
    let t = null;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (!offered) maybeOffer();
        else if (panel && lastReport && collectFields().some((f) => !hasValue(f) && !f.el.hasAttribute?.("data-cf-state"))) {
          panel.msg("New questions appeared on this step.");
          panel.root.getElementById("fill").textContent = "Fill this step";
        }
      }, 700);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();

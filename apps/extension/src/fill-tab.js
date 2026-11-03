// Shared by the popup button and the Alt+Shift+F shortcut.
/** Injects the filler into every frame we may access, runs it, and adds up the results. */
export async function fillTab(tabId) {
  const files = ["fieldmatch.js", "filler.js"];
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files });
  }
  let results;
  try {
    results = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => (window.__cfFiller ? window.__cfFiller.fill({ source: "manual" }) : null) });
  } catch {
    results = await chrome.scripting.executeScript({ target: { tabId }, func: () => (window.__cfFiller ? window.__cfFiller.fill({ source: "manual" }) : null) });
  }
  const total = { filled: 0, drafted: 0, needs: 0, resume: false, missing: [], errors: [] };
  for (const r of results || []) {
    const v = r.result;
    if (!v) continue;
    if (v.error) total.errors.push(v.error);
    total.filled += v.filled || 0;
    total.drafted += v.drafted || 0;
    total.needs += v.needs || 0;
    total.resume = total.resume || !!v.resume;
    if (v.missing?.length) total.missing = v.missing;
  }
  return total;
}

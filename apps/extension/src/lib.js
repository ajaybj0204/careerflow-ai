// Pure helpers shared by the popup and tests. No network or Chrome APIs here.

const PORTALS = [
  [/naukri\.com$/, "Naukri"],
  [/linkedin\.com$/, "LinkedIn"],
  [/indeed\.com$/, "Indeed"],
  [/foundit\.in$/, "Foundit"],
  [/hirist\.(tech|com)$/, "Hirist"],
  [/instahyre\.com$/, "Instahyre"],
  [/cutshort\.io$/, "Cutshort"],
  [/wellfound\.com$/, "Wellfound"],
  [/iimjobs\.com$/, "iimjobs"],
  [/shine\.com$/, "Shine"],
  [/timesjobs\.com$/, "TimesJobs"],
  [/glassdoor\.(co\.in|com)$/, "Glassdoor"],
  [/internshala\.com$/, "Internshala"],
  [/ncs\.gov\.in$/, "National Career Service"],
  [/apna\.co$/, "Apna"],
  [/greenhouse\.io$/, "Company site (Greenhouse)"],
  [/lever\.co$/, "Company site (Lever)"],
  [/myworkdayjobs\.com$/, "Company site (Workday)"],
];

export function portalFromHost(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/^www\./, "");
  for (const [re, name] of PORTALS) if (re.test(h)) return name;
  return "Company website";
}

export function stripHtml(s) {
  return String(s || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** Finds a schema.org JobPosting in JSON-LD blocks (used by most job sites for search engines). */
export function parseJobPostingJsonLd(blocks) {
  for (const text of blocks || []) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      continue;
    }
    const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
    for (const it of items) {
      const type = Array.isArray(it?.["@type"]) ? it["@type"] : [it?.["@type"]];
      if (!type.includes("JobPosting")) continue;
      const org = it.hiringOrganization;
      const loc = Array.isArray(it.jobLocation) ? it.jobLocation[0] : it.jobLocation;
      const addr = loc?.address;
      return {
        roleTitle: it.title ? String(it.title).trim() : null,
        company: typeof org === "string" ? org : org?.name ?? null,
        location: addr ? [addr.addressLocality, addr.addressRegion].filter(Boolean).join(", ") || null : it.jobLocationType === "TELECOMMUTE" ? "Remote" : null,
        description: it.description ? stripHtml(it.description).slice(0, 30000) : null,
        externalJobId: it.identifier ? String(it.identifier.value ?? it.identifier.name ?? it.identifier).slice(0, 100) : null,
      };
    }
  }
  return null;
}

/** Builds the job record from what the page exposed. The user reviews and edits it before saving. */
export function buildJob(raw) {
  const ld = parseJobPostingJsonLd(raw.jsonLd);
  const url = new URL(raw.url);
  const ogTitle = raw.ogTitle || "";
  // "Data Analyst - Acme Corp | LinkedIn" -> role / company guesses when no structured data exists
  const parts = (raw.h1 || ogTitle || raw.title || "").split(/\s+[|\-–]\s+|\s+at\s+/);
  return {
    roleTitle: ld?.roleTitle || (parts[0] || "").trim().slice(0, 200) || "",
    company: ld?.company || (parts[1] && !/linkedin|naukri|indeed|glassdoor/i.test(parts[1]) ? parts[1].trim() : raw.siteName || "") || "",
    location: ld?.location || null,
    description: ld?.description || (raw.selection && raw.selection.length > 80 ? raw.selection.slice(0, 30000) : raw.mainText ? raw.mainText.slice(0, 30000) : null),
    externalJobId: ld?.externalJobId || null,
    url: `${url.origin}${url.pathname}${url.search}`.slice(0, 2000),
    portal: portalFromHost(url.hostname),
    source: ld ? "structured data" : "page text",
  };
}

export function normalizeAppUrl(u) {
  const s = String(u || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(s)) throw new Error("App URL must start with http:// or https://");
  const url = new URL(s);
  if (url.protocol === "http:" && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) throw new Error("Use https:// for hosted CareerFlow URLs.");
  return url.origin;
}

const COMPANY_SUFFIXES =
  /\b(private|pvt|limited|ltd|llp|inc|incorporated|corp|corporation|co|company|plc|gmbh|india|technologies|technology|tech|solutions|services|software|labs|group|global)\b\.?/g;

/** "Razorpay Software Pvt. Ltd." -> "razorpay" */
export function normalizeCompany(name: string | null | undefined): string {
  if (!name) return "";
  const base = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const stripped = base.replace(COMPANY_SUFFIXES, " ").replace(/\s+/g, " ").trim();
  return stripped || base;
}

const ROLE_NOISE = /\b(sr|senior|jr|junior|associate|lead|i{1,3}|iv|level \d|l\d)\b\.?/g;
export function normalizeRole(title: string | null | undefined): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(ROLE_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stable key used to detect duplicate applications. */
export function applicationDedupeKey(input: { company: string; roleTitle: string; externalJobId?: string | null }): string {
  const c = normalizeCompany(input.company);
  if (input.externalJobId) return `${c}|job:${input.externalJobId.trim().toLowerCase()}`;
  return `${c}|${normalizeRole(input.roleTitle)}`;
}

/** Similarity of two strings by shared word tokens (0..1). */
export function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1));
  const tb = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

export function emailDomain(email: string | null | undefined): string | null {
  const m = email?.toLowerCase().match(/@([a-z0-9.-]+)/);
  return m ? m[1] : null;
}

/** Root domain without common mail/ATS subdomains: "careers.razorpay.com" -> "razorpay.com" */
export function rootDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const parts = domain.toLowerCase().split(".");
  if (parts.length <= 2) return parts.join(".");
  const twoPartTld = /^(co|com|net|org|gov|ac)\.[a-z]{2}$/.test(parts.slice(-2).join("."));
  return parts.slice(twoPartTld ? -3 : -2).join(".");
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Numbers in a text ("40%", "₹3.4 lakh", "1,200") used to detect invented metrics. */
export function extractNumbers(s: string): string[] {
  return (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
}

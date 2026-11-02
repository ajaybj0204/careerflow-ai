import { emailDomain } from "@careerflow/shared";

/**
 * Job scam detector. Evidence-based warning signs only. It never declares a job genuine
 * and never accuses an organisation: it lists what was found and suggests how to verify.
 */
export interface ScamSignal {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  evidence: string;
  advice: string;
}

const RULES: { id: string; severity: ScamSignal["severity"]; title: string; re: RegExp; advice: string }[] = [
  { id: "fee", severity: "high", title: "Asks for a fee or deposit", re: /\b(registration|processing|training|security|refundable|interview|onboarding|document(ation)?|verification|kit|laptop)\s*(fee|fees|charges?|deposit|amount)\b|\bpay\s*(₹|rs\.?|inr)\s*\d/i, advice: "Genuine employers do not charge candidates to apply, interview or join. Do not pay." },
  { id: "upi-pay", severity: "high", title: "Asks for payment via UPI, wallet or gift cards", re: /\b(send|transfer|pay)\b[^.\n]{0,40}\b(upi|paytm|phonepe|google pay|gpay|gift card|crypto|bitcoin)\b|\bupi id\b/i, advice: "Payment requests by UPI or gift cards are a common scam pattern." },
  { id: "unrealistic", severity: "medium", title: "Unrealistic pay or promises", re: /\b(earn|salary|income)\b[^.\n]{0,30}(₹|rs\.?)\s*[\d,]{2,}\s*(per|\/)\s*(day|hour)|\b(guaranteed|100%)\s*(job|placement|selection|income)\b|\bno (experience|interview) (needed|required)\b.*\b(high|huge) (salary|income)\b/i, advice: "Compare with typical pay for the role on Glassdoor or AmbitionBox." },
  { id: "personal-docs", severity: "high", title: "Asks for sensitive documents or banking details early", re: /\b(aadhaar|aadhar|pan card|bank (account|details)|otp|cvv|atm pin|net ?banking password)\b[^.\n]{0,60}\b(send|share|upload|provide|whatsapp)\b|\b(send|share|upload|provide|whatsapp)\b[^.\n]{0,60}\b(aadhaar|aadhar|pan card|bank (account|details)|otp|cvv)\b/i, advice: "Share identity documents only after a verified written offer, through the company's official HR system. Never share OTPs or PINs." },
  { id: "chat-only", severity: "medium", title: "Interview or hiring only on WhatsApp/Telegram", re: /\b(whatsapp|telegram)\b[^.\n]{0,50}\b(interview|hr|join|contact|chat|message)\b|\b(interview|hr)\b[^.\n]{0,50}\b(whatsapp|telegram)\b/i, advice: "Ask for an official email from a company domain and a video or in-person interview." },
  { id: "urgency", severity: "low", title: "Pressure to act immediately", re: /\b(urgent(ly)?|immediately|within (the next )?\d+ (hours?|minutes?)|limited (seats|slots)|last chance|today only)\b/i, advice: "Take time to verify; genuine processes rarely require same-day payment or decisions." },
  { id: "task-scam", severity: "high", title: "Pay-to-earn tasks (likes, reviews, ratings)", re: /\b(like|rate|review|subscribe)\b[^.\n]{0,40}\b(youtube|google maps|hotel|products?)\b[^.\n]{0,60}\b(earn|commission|paid)\b|\bprepaid tasks?\b/i, advice: "'Task' jobs paying for likes or reviews often turn into deposit scams." },
  { id: "offer-no-interview", severity: "medium", title: "Offer without any interview", re: /\b(selected|offer)\b[^.\n]{0,60}\bwithout (any )?interview\b|\bdirect (joining|selection)\b/i, advice: "Legitimate offers follow some form of assessment. Verify with the company directly." },
  { id: "short-link", severity: "low", title: "Shortened or disguised links", re: /\b(bit\.ly|tinyurl\.com|t\.co|cutt\.ly|rb\.gy|is\.gd|shorturl\.at)\//i, advice: "Expand shortened links before clicking, and prefer the company's official careers page." },
];

const FREE_MAIL = /^(gmail|yahoo|outlook|hotmail|rediffmail|ymail|protonmail|live)\./i;
const LOOKALIKE_BRANDS = ["amazon", "flipkart", "tcs", "infosys", "wipro", "accenture", "google", "microsoft", "razorpay", "paytm", "phonepe", "hdfc", "icici", "deloitte", "reliance", "jio"];

export function detectScam(input: { text: string; senderEmail?: string | null; claimedCompany?: string | null; urls?: string[] }): { risk: "low" | "medium" | "high"; signals: ScamSignal[]; disclaimer: string; checks: string[] } {
  const signals: ScamSignal[] = [];
  for (const r of RULES) {
    const m = input.text.match(r.re);
    if (m) signals.push({ id: r.id, severity: r.severity, title: r.title, evidence: `"…${input.text.slice(Math.max(0, (m.index ?? 0) - 30), (m.index ?? 0) + m[0].length + 30).replace(/\s+/g, " ").trim()}…"`, advice: r.advice });
  }
  const domain = emailDomain(input.senderEmail ?? null);
  const company = (input.claimedCompany ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (domain && FREE_MAIL.test(domain) && company)
    signals.push({ id: "free-mail", severity: "medium", title: "Company recruiter using a free email address", evidence: `Sender: ${input.senderEmail}; claims to represent ${input.claimedCompany}.`, advice: "Large companies usually email from their own domain. Verify on the official careers page." });
  if (domain && company && !FREE_MAIL.test(domain) && !domain.replace(/[^a-z]/g, "").includes(company.slice(0, 5)))
    signals.push({ id: "domain-mismatch", severity: "low", title: "Sender domain does not match the company name", evidence: `Sender domain ${domain} vs company "${input.claimedCompany}".`, advice: "Some companies use recruitment agencies or ATS domains; confirm the sender independently." });
  const urls = [...(input.urls ?? []), ...(input.text.match(/https?:\/\/[^\s)]+/g) ?? [])];
  for (const u of urls) {
    try {
      const host = new URL(u).hostname.toLowerCase();
      const brand = LOOKALIKE_BRANDS.find((b) => host.includes(b) && !new RegExp(`(^|\\.)${b}\\.(com|in|co\\.in|net)$`).test(host));
      if (brand) signals.push({ id: "lookalike", severity: "high", title: "Possible look-alike website", evidence: `Link ${host} contains "${brand}" but is not its usual official domain.`, advice: "Type the company's official website yourself instead of using the link." });
      if (/\.(xyz|top|click|buzz|live|online|site|icu)$/.test(host)) signals.push({ id: "odd-tld", severity: "low", title: "Unusual website ending", evidence: host, advice: "Check the domain's age and ownership before sharing details." });
    } catch {
      /* not a valid URL */
    }
  }
  const high = signals.filter((s) => s.severity === "high").length;
  const med = signals.filter((s) => s.severity === "medium").length;
  const risk = high >= 1 || med >= 2 ? "high" : med === 1 || signals.length >= 2 ? "medium" : "low";
  return {
    risk,
    signals,
    disclaimer: risk === "low" ? "No common warning signs were found. This does not prove the job is genuine — always verify independently." : "These are warning signs, not proof. Verify with the company through its official website or phone number.",
    checks: ["Find the job on the company's official careers page", "Confirm the recruiter on LinkedIn and with the company's HR", "Never pay any fee or share OTPs, PINs or bank passwords", "Search the company name with 'scam' or 'fraud'"],
  };
}

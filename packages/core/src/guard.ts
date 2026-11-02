import { canonicalSkill, detectSkills, extractNumbers } from "@careerflow/shared";

/**
 * Fabrication guard for AI-written resume text, cover letters and answers.
 * A proposed sentence is rejected when it introduces:
 *  - a skill/tool that is neither verified by the user nor present in the original text
 *  - a number (metric, percentage, amount, year) that is not in the original text or verified facts
 *  - a company/organisation name that is not in the verified profile
 */
export interface GuardInput {
  original: string;
  proposed: string;
  allowedSkills: Set<string>; // lower-case canonical names
  allowedNumbers: Set<string>;
  allowedOrgs: string[]; // lower-case
}

export interface GuardIssue {
  kind: "new_skill" | "new_number" | "new_organisation" | "empty" | "too_long";
  detail: string;
}

export function checkProposedText(g: GuardInput): GuardIssue[] {
  const issues: GuardIssue[] = [];
  const proposed = g.proposed.trim();
  if (!proposed) return [{ kind: "empty", detail: "Suggestion is empty" }];
  if (g.original && proposed.length > Math.max(400, g.original.length * 2.2)) issues.push({ kind: "too_long", detail: "Suggestion is much longer than the original" });

  const originalSkills = new Set(detectSkills(g.original).map((s) => s.toLowerCase()));
  for (const s of detectSkills(proposed)) {
    const k = canonicalSkill(s).toLowerCase();
    if (!originalSkills.has(k) && !g.allowedSkills.has(k)) issues.push({ kind: "new_skill", detail: `Adds "${s}", which is not in your verified skills` });
  }
  const originalNumbers = new Set(extractNumbers(g.original));
  for (const n of extractNumbers(proposed)) {
    if (!originalNumbers.has(n) && !g.allowedNumbers.has(n)) issues.push({ kind: "new_number", detail: `Adds the number "${n}", which is not in your original text or verified facts` });
  }
  // Capitalised multi-word names that look like organisations ("at Big Bank Ltd")
  const orgs = proposed.match(/\b(?:at|with|for|joined)\s+([A-Z][\w&.]*(?:\s+[A-Z][\w&.]*){0,3})/g) ?? [];
  for (const o of orgs) {
    const raw = o.replace(/^(at|with|for|joined)\s+/i, "").replace(/[.,;:]+$/, "");
    const name = raw.toLowerCase();
    if (name.length < 3 || g.original.toLowerCase().includes(name)) continue;
    // Skills and acronyms ("KYC", "SQL") are not organisations; the skill check covers them
    if (detectSkills(raw).length || /^[A-Z0-9/&]{2,6}$/.test(raw)) continue;
    if (!g.allowedOrgs.some((a) => a && (a.includes(name) || name.includes(a)))) issues.push({ kind: "new_organisation", detail: `Mentions "${raw}", which is not in your profile` });
  }
  return issues;
}

/** Numbers that appear anywhere in verified facts (so "300+" from an achievement may be reused). */
export function numbersFrom(texts: (string | null | undefined)[]): Set<string> {
  const s = new Set<string>();
  for (const t of texts) if (t) for (const n of extractNumbers(t)) s.add(n);
  return s;
}

import { detectSkills, type ParsedResume } from "@careerflow/shared";

/**
 * Rule-based resume parser. Works without AI and is used as the baseline; when AI is configured its
 * structured extraction is used instead. Everything extracted is stored as "document_extracted"
 * and must be confirmed by the user before AI features treat it as fact.
 */
const HEAD = /^(professional\s+)?(summary|profile|objective|about me|experience|work experience|professional experience|employment( history)?|education|academic background|skills|technical skills|key skills|core competencies|projects|key projects|personal projects|certifications?|courses|achievements|awards)\s*:?$/i;

function sectionName(line: string): string | null {
  const m = line.trim().match(HEAD);
  if (!m) return null;
  const t = m[0].toLowerCase();
  if (/summary|profile|objective|about/.test(t)) return "summary";
  if (/experience|employment/.test(t)) return "experience";
  if (/education|academic/.test(t)) return "education";
  if (/skill|competenc/.test(t)) return "skills";
  if (/project/.test(t)) return "projects";
  if (/certif|course/.test(t)) return "certifications";
  return "achievements";
}

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE_RANGE = new RegExp(
  `((?:${MONTH}\\s*)?(?:19|20)\\d{2}|\\d{1,2}/(?:19|20)\\d{2})\\s*(?:-|–|—|to)\\s*((?:${MONTH}\\s*)?(?:19|20)\\d{2}|\\d{1,2}/(?:19|20)\\d{2}|present|current|now|till date)`,
  "i",
);

const BULLET = /^\s*[•●▪◦‣\-–*]\s*/;

export function parseResumeText(text: string): ParsedResume {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const sections: Record<string, string[]> = { header: [] };
  let cur = "header";
  for (const l of lines) {
    const s = sectionName(l);
    if (s) {
      cur = s;
      sections[cur] ??= [];
      continue;
    }
    (sections[cur] ??= []).push(l);
  }
  const all = text;
  const email = all.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;
  const phone = all.match(/(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/)?.[0] ?? null;
  const links = [...new Set(all.match(/(https?:\/\/[^\s|,]+|(?:www\.)?(?:linkedin\.com|github\.com)\/[^\s|,]+)/gi) ?? [])].slice(0, 10);
  const header = sections.header ?? [];
  const fullName = header.find((l) => /^[A-Za-z][A-Za-z .'-]{2,40}$/.test(l) && !/@/.test(l)) ?? null;

  // Experience: a date range line starts a new entry; following bullets belong to it
  const employment: ParsedResume["employment"] = [];
  const exp = sections.experience ?? [];
  for (let i = 0; i < exp.length; i++) {
    const l = exp[i];
    const dr = l.match(DATE_RANGE);
    if (dr && !BULLET.test(l)) {
      const before = l.slice(0, dr.index).replace(/[|,–-]\s*$/, "").trim();
      const prev = !before && i > 0 && !BULLET.test(exp[i - 1]) ? exp[i - 1] : "";
      const head = before || prev;
      const [a, b] = head.split(/\s*(?:\||,| at | - | – )\s*/);
      const entry = {
        company: (b ?? a ?? "").trim() || "Unknown",
        title: (b ? a : "").trim() || (exp[i + 1] && !BULLET.test(exp[i + 1]) && !DATE_RANGE.test(exp[i + 1]) ? exp[i + 1] : "Unknown"),
        location: null,
        startDate: dr[1],
        endDate: /present|current|now|till/i.test(dr[2]) ? null : dr[2],
        isCurrent: /present|current|now|till/i.test(dr[2]),
        bullets: [] as string[],
      };
      employment.push(entry);
    } else if (employment.length && (BULLET.test(l) || (l.length >= 40 && !DATE_RANGE.test(exp[i + 1] ?? "")))) {
      // Word list bullets lose their bullet character in plain text, so sentence-length lines under an entry count as bullets
      const cur = employment[employment.length - 1];
      if (l !== cur.title) cur.bullets.push(l.replace(BULLET, ""));
    }
  }

  const education: ParsedResume["education"] = [];
  for (const l of sections.education ?? []) {
    if (/(university|college|institute|school|iit|nit|b\.?e|b\.?tech|bachelor|master|mba|b\.?com|bca|mca|b\.?sc)/i.test(l)) {
      const year = l.match(/(?:19|20)\d{2}(?!.*(?:19|20)\d{2})/)?.[0];
      education.push({ institution: l.slice(0, 200), degree: null, field: null, endYear: year ? Number(year) : null, grade: l.match(/(\d\.\d+\s*(?:cgpa|gpa)|\d{2}(?:\.\d+)?\s*%)/i)?.[0] ?? null });
    }
  }

  const skillText = (sections.skills ?? []).join("\n");
  const listed = skillText
    .split(/[,|•●;\n]/)
    .map((s) => s.replace(/^[A-Za-z &]+:\s*/, "").trim())
    .filter((s) => s.length > 1 && s.length < 40);
  const skills = [...new Set([...detectSkills(all), ...listed])].slice(0, 80);

  const certifications = (sections.certifications ?? []).map((l) => ({ name: l.replace(BULLET, "").slice(0, 200), issuer: null }));
  const projects: ParsedResume["projects"] = [];
  for (const l of sections.projects ?? []) {
    if (!BULLET.test(l) && l.length < 120) projects.push({ name: l, description: null, tech: detectSkills(l), url: null });
    else if (projects.length) {
      const p = projects[projects.length - 1];
      p.description = [p.description, l.replace(BULLET, "")].filter(Boolean).join(" ");
      p.tech = [...new Set([...p.tech, ...detectSkills(l)])];
    }
  }

  return {
    fullName,
    email,
    phone,
    location: header.find((l) => /bengaluru|bangalore|mumbai|delhi|pune|hyderabad|chennai|kolkata|india/i.test(l))?.slice(0, 100) ?? null,
    headline: null,
    summary: (sections.summary ?? []).join(" ").slice(0, 2000) || null,
    links,
    employment,
    education,
    skills,
    certifications,
    projects,
  };
}

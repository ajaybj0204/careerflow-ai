/**
 * Skills dictionary used for job description analysis, resume skill detection and the
 * fabrication guard (a tailored resume may not introduce a skill the user has not verified).
 */
export interface SkillDef {
  name: string;
  category: "data" | "tools" | "programming" | "payments" | "operations" | "business" | "finance" | "soft" | "cloud" | "product";
  aliases?: string[];
}

export const SKILLS: SkillDef[] = [
  // data & analytics
  { name: "SQL", category: "data", aliases: ["mysql", "postgresql", "postgres", "t-sql", "pl/sql", "sql server"] },
  { name: "Excel", category: "tools", aliases: ["ms excel", "microsoft excel", "advanced excel", "spreadsheets"] },
  { name: "Pivot Tables", category: "tools", aliases: ["pivot table", "pivots"] },
  { name: "VLOOKUP", category: "tools", aliases: ["xlookup", "vlookup", "index match"] },
  { name: "Power Query", category: "tools" },
  { name: "VBA", category: "programming", aliases: ["macros", "excel macros"] },
  { name: "Power BI", category: "tools", aliases: ["powerbi", "power-bi", "dax"] },
  { name: "Tableau", category: "tools" },
  { name: "Looker", category: "tools", aliases: ["looker studio", "google data studio", "data studio"] },
  { name: "Google Sheets", category: "tools", aliases: ["gsheets", "google spreadsheets"] },
  { name: "Python", category: "programming" },
  { name: "Pandas", category: "programming" },
  { name: "NumPy", category: "programming", aliases: ["numpy"] },
  { name: "R", category: "programming", aliases: ["r programming", "rstudio"] },
  { name: "Statistics", category: "data", aliases: ["statistical analysis", "hypothesis testing", "regression"] },
  { name: "Data Analysis", category: "data", aliases: ["data analytics", "analytics"] },
  { name: "Data Visualization", category: "data", aliases: ["dashboards", "dashboarding", "data visualisation", "reporting dashboards"] },
  { name: "Data Cleaning", category: "data", aliases: ["data wrangling", "data quality"] },
  { name: "ETL", category: "data", aliases: ["data pipelines", "elt"] },
  { name: "A/B Testing", category: "data", aliases: ["ab testing", "experimentation"] },
  { name: "Machine Learning", category: "data", aliases: ["ml"] },
  { name: "BigQuery", category: "cloud" },
  { name: "Snowflake", category: "cloud" },
  { name: "Metabase", category: "tools" },
  { name: "Jira", category: "tools" },
  { name: "Confluence", category: "tools" },
  { name: "Salesforce", category: "tools", aliases: ["sfdc"] },
  { name: "Zoho", category: "tools", aliases: ["zoho crm"] },
  { name: "Freshdesk", category: "tools" },
  { name: "SAP", category: "tools" },
  { name: "Tally", category: "tools", aliases: ["tally erp"] },
  { name: "Git", category: "programming", aliases: ["github", "gitlab"] },
  { name: "JavaScript", category: "programming", aliases: ["js"] },
  { name: "TypeScript", category: "programming", aliases: ["ts"] },
  { name: "React", category: "programming", aliases: ["react.js", "reactjs"] },
  { name: "Next.js", category: "programming", aliases: ["nextjs"] },
  { name: "Node.js", category: "programming", aliases: ["nodejs"] },
  { name: "HTML", category: "programming", aliases: ["html5"] },
  { name: "CSS", category: "programming", aliases: ["css3", "tailwind"] },
  { name: "APIs", category: "programming", aliases: ["rest api", "rest apis", "api integration", "api"] },
  { name: "AWS", category: "cloud", aliases: ["amazon web services"] },
  { name: "GCP", category: "cloud", aliases: ["google cloud"] },
  { name: "Azure", category: "cloud" },
  { name: "Generative AI", category: "programming", aliases: ["genai", "llm", "llms", "prompt engineering", "chatgpt", "gemini", "ai tools"] },
  { name: "Automation", category: "operations", aliases: ["process automation", "workflow automation", "zapier", "n8n", "make.com", "rpa"] },
  // payments & fintech
  { name: "UPI", category: "payments", aliases: ["unified payments interface", "bhim"] },
  { name: "Payment Gateway", category: "payments", aliases: ["payment gateways", "pg"] },
  { name: "POS", category: "payments", aliases: ["pos terminals", "point of sale", "edc", "pos machines"] },
  { name: "Merchant Onboarding", category: "payments", aliases: ["merchant acquisition", "merchant activation"] },
  { name: "KYC", category: "payments", aliases: ["know your customer", "ckyc", "video kyc", "e-kyc", "ekyc"] },
  { name: "AML", category: "payments", aliases: ["anti money laundering", "anti-money laundering"] },
  { name: "Reconciliation", category: "payments", aliases: ["recon", "payment reconciliation", "bank reconciliation"] },
  { name: "Settlements", category: "payments", aliases: ["settlement", "merchant settlement"] },
  { name: "Chargebacks", category: "payments", aliases: ["chargeback", "disputes", "dispute management"] },
  { name: "Transaction Monitoring", category: "payments", aliases: ["fraud monitoring", "risk monitoring"] },
  { name: "Risk Management", category: "finance", aliases: ["risk assessment", "credit risk", "operational risk"] },
  { name: "Compliance", category: "finance", aliases: ["regulatory compliance", "rbi guidelines", "rbi compliance"] },
  { name: "NPCI", category: "payments" },
  { name: "Card Payments", category: "payments", aliases: ["cards", "card networks", "visa", "mastercard", "rupay"] },
  { name: "NEFT/RTGS/IMPS", category: "payments", aliases: ["neft", "rtgs", "imps"] },
  { name: "MID/TID Management", category: "payments", aliases: ["mid", "tid", "mid/tid", "terminal id", "merchant id"] },
  { name: "Banking Operations", category: "finance", aliases: ["bank operations", "banking"] },
  { name: "Financial Analysis", category: "finance", aliases: ["financial modelling", "financial modeling"] },
  { name: "Accounting", category: "finance", aliases: ["bookkeeping", "accounts"] },
  // operations & business
  { name: "Business Operations", category: "operations", aliases: ["bizops", "business ops"] },
  { name: "Process Improvement", category: "operations", aliases: ["process optimization", "process optimisation", "continuous improvement", "kaizen"] },
  { name: "Lean Six Sigma", category: "operations", aliases: ["six sigma", "lean"] },
  { name: "SLA Management", category: "operations", aliases: ["sla", "slas", "tat", "turnaround time"] },
  { name: "Vendor Management", category: "operations", aliases: ["vendor coordination", "partner management"] },
  { name: "Stakeholder Management", category: "soft", aliases: ["stakeholder communication", "cross-functional collaboration", "cross functional"] },
  { name: "Project Management", category: "operations", aliases: ["program management", "pmp"] },
  { name: "Agile", category: "operations", aliases: ["scrum", "kanban"] },
  { name: "Requirements Gathering", category: "business", aliases: ["requirement gathering", "brd", "frd", "user stories", "business requirements"] },
  { name: "Business Analysis", category: "business", aliases: ["business analyst"] },
  { name: "Process Mapping", category: "business", aliases: ["process documentation", "sop", "sops", "bpmn", "flowcharts"] },
  { name: "KPI Tracking", category: "business", aliases: ["kpis", "kpi", "metrics", "okrs"] },
  { name: "MIS Reporting", category: "business", aliases: ["mis", "mis reports", "reporting"] },
  { name: "Root Cause Analysis", category: "business", aliases: ["rca", "root-cause analysis"] },
  { name: "Customer Success", category: "operations", aliases: ["client success", "account management"] },
  { name: "Escalation Management", category: "operations", aliases: ["escalations", "issue resolution"] },
  { name: "Product Operations", category: "product", aliases: ["product ops"] },
  { name: "Product Management", category: "product", aliases: ["product manager", "roadmap"] },
  { name: "CRM", category: "tools", aliases: ["crm tools"] },
  { name: "Communication", category: "soft", aliases: ["written communication", "verbal communication", "communication skills"] },
  { name: "Problem Solving", category: "soft", aliases: ["analytical thinking", "critical thinking", "problem-solving"] },
  { name: "Team Leadership", category: "soft", aliases: ["people management", "team management", "leadership"] },
  { name: "Negotiation", category: "soft" },
  { name: "Attention to Detail", category: "soft", aliases: ["detail oriented", "detail-oriented"] },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

const MATCHERS = SKILLS.map((s) => {
  const terms = [s.name, ...(s.aliases ?? [])].map((t) => t.toLowerCase());
  // Very short terms (R, JS, PG, ML, TS) only match as whole uppercase words in the original text
  const short = terms.filter((t) => t.length <= 2);
  const long = terms.filter((t) => t.length > 2);
  const longRe = long.length ? new RegExp(`(?<![a-z0-9])(?:${long.map(escape).join("|")})(?![a-z0-9])`, "i") : null;
  const shortRe = short.length ? new RegExp(`(?<![A-Za-z0-9])(?:${short.map((t) => escape(t.toUpperCase())).join("|")})(?![A-Za-z0-9])`) : null;
  return { skill: s, longRe, shortRe };
});

/** Finds known skills mentioned in a text. Returns canonical names. */
export function detectSkills(text: string): string[] {
  const found: string[] = [];
  for (const m of MATCHERS) {
    if ((m.longRe && m.longRe.test(text)) || (m.shortRe && m.shortRe.test(text))) found.push(m.skill.name);
  }
  return found;
}

/** Canonical name for a free-text skill ("ms excel" -> "Excel"). Unknown skills are returned trimmed. */
export function canonicalSkill(name: string): string {
  const n = name.trim().toLowerCase();
  for (const s of SKILLS) {
    if (s.name.toLowerCase() === n || s.aliases?.some((a) => a === n)) return s.name;
  }
  return name.trim();
}

export function skillCategory(name: string): SkillDef["category"] | null {
  const c = canonicalSkill(name);
  return SKILLS.find((s) => s.name === c)?.category ?? null;
}

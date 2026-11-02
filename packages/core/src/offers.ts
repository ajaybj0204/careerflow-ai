import { untrusted } from "@careerflow/ai";
import { extractText } from "@careerflow/document-engine";
import { offerExtractionSchema } from "@careerflow/shared";
import type { Database, Tx } from "@careerflow/database";
import { aiFor } from "./ai";
import { saveDocument, validateUpload } from "./storage";

/**
 * Approximate take-home calculator, India, new tax regime (FY 2025-26 / AY 2026-27).
 * Every assumption is returned with the result. Not tax or financial advice.
 */
export interface TakeHomeInput {
  annualFixedCtc: number;
  variablePay?: number;
  basicPercentOfFixed?: number; // default 40
  employerPfInCtc?: boolean; // default true
  pfMode?: "full" | "capped" | "none"; // employee PF: 12% of basic, or on ₹15,000 wage ceiling
  gratuityInCtc?: boolean; // default false
  professionalTaxAnnual?: number; // default 2,400 (Karnataka)
  otherAnnualDeductions?: number;
  includeVariable?: boolean; // include variable pay in taxable income
}

const SLABS: [number, number][] = [
  [400000, 0],
  [800000, 0.05],
  [1200000, 0.1],
  [1600000, 0.15],
  [2000000, 0.2],
  [2400000, 0.25],
  [Infinity, 0.3],
];

export function slabTax(taxable: number): number {
  let tax = 0;
  let prev = 0;
  for (const [limit, rate] of SLABS) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, limit) - prev) * rate;
    prev = limit;
  }
  return tax;
}

export function incomeTaxNewRegime(grossSalary: number) {
  const standardDeduction = 75000;
  const taxable = Math.max(0, grossSalary - standardDeduction);
  let tax = slabTax(taxable);
  let rebate = 0;
  if (taxable <= 1200000) {
    rebate = tax; // section 87A: no tax up to ₹12 lakh taxable income
    tax = 0;
  } else {
    const relief = Math.max(0, tax - (taxable - 1200000)); // marginal relief just above ₹12 lakh
    rebate = relief;
    tax -= relief;
  }
  const surchargeRate = taxable > 20000000 ? 0.25 : taxable > 10000000 ? 0.15 : taxable > 5000000 ? 0.1 : 0;
  const surcharge = tax * surchargeRate;
  const cess = (tax + surcharge) * 0.04;
  return { taxable, slabTax: slabTax(taxable), rebate, surcharge, cess, total: Math.round(tax + surcharge + cess) };
}

export function takeHome(i: TakeHomeInput) {
  const fixed = Math.max(0, i.annualFixedCtc);
  const basic = fixed * ((i.basicPercentOfFixed ?? 40) / 100);
  const pfWage = i.pfMode === "capped" ? Math.min(basic, 15000 * 12) : basic;
  const employerPf = i.employerPfInCtc === false || i.pfMode === "none" ? 0 : pfWage * 0.12;
  const gratuity = i.gratuityInCtc ? basic * 0.0481 : 0;
  const grossFixed = fixed - employerPf - gratuity;
  const variable = i.includeVariable ? i.variablePay ?? 0 : 0;
  const gross = grossFixed + variable;
  const employeePf = i.pfMode === "none" ? 0 : pfWage * 0.12;
  const pt = i.professionalTaxAnnual ?? 2400;
  const tax = incomeTaxNewRegime(gross);
  const other = i.otherAnnualDeductions ?? 0;
  const annualNet = gross - employeePf - pt - tax.total - other;
  return {
    annualGross: Math.round(gross),
    employerPf: Math.round(employerPf),
    gratuity: Math.round(gratuity),
    employeePf: Math.round(employeePf),
    professionalTax: pt,
    tax,
    otherDeductions: other,
    annualNet: Math.round(annualNet),
    monthlyNet: Math.round(annualNet / 12),
    assumptions: [
      "New tax regime, FY 2025-26 slabs: 0–4L nil, 4–8L 5%, 8–12L 10%, 12–16L 15%, 16–20L 20%, 20–24L 25%, above 24L 30%.",
      "Standard deduction ₹75,000; Section 87A rebate up to ₹12 lakh taxable income, with marginal relief; 4% health & education cess.",
      `Basic salary assumed at ${i.basicPercentOfFixed ?? 40}% of fixed CTC (check your offer's breakup).`,
      i.pfMode === "none" ? "No PF assumed." : `PF at 12% of ${i.pfMode === "capped" ? "basic capped at ₹15,000/month" : "basic"}${i.employerPfInCtc === false ? "; employer PF paid outside CTC" : "; employer PF assumed to be inside CTC"}.`,
      i.gratuityInCtc ? "Gratuity (4.81% of basic) assumed to be inside CTC and not paid monthly." : "Gratuity not deducted from CTC.",
      `Professional tax ₹${pt.toLocaleString("en-IN")}/year (Karnataka default; varies by state).`,
      i.includeVariable ? "Variable pay included in taxable income for the year; it is usually paid later, not monthly." : "Variable pay excluded (usually paid later and not guaranteed).",
      "Ignores other exemptions/deductions, perquisites and employer-specific components. Approximate only — not tax or financial advice.",
    ],
  };
}

const AMOUNT = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(lakhs?|lpa|l)?|([\d.]+)\s*(lakhs?|lpa)/i;
function parseAmount(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(AMOUNT);
  if (!m) return null;
  const n = parseFloat((m[1] ?? m[3]).replace(/,/g, ""));
  const unit = (m[2] ?? m[4] ?? "").toLowerCase();
  return unit.startsWith("l") ? n * 100000 : n;
}

/** Regex fallback extraction. Fields it cannot find are listed as missing, never guessed. */
export function extractOfferRules(text: string) {
  const near = (label: RegExp) => text.match(new RegExp(`${label.source}[^\\n]{0,80}`, "i"))?.[0];
  const fixed = parseAmount(near(/(fixed (ctc|compensation|pay)|annual fixed|fixed component)/)) ?? parseAmount(near(/(cost to company|ctc|annual compensation|gross annual)/));
  const variable = parseAmount(near(/(variable|performance (bonus|pay)|incentive)/));
  const joining = parseAmount(near(/(joining|sign[- ]on) bonus/));
  const notice = text.match(/notice period[^\n.]{0,40}?(\d{1,3})\s*(days|months?)/i);
  const probation = text.match(/probation[^\n.]{0,40}?(\d{1,2})\s*months?/i);
  const doj = text.match(/(date of joining|joining date|start date)[^\n]{0,10}?[:\-]?\s*([0-9]{1,2}[^\n,]{2,20}\d{4})/i);
  const benefits = ["health insurance", "medical insurance", "life insurance", "meal", "food", "laptop", "internet", "esops?", "stock options", "relocation", "gym", "education"].filter((b) => new RegExp(b, "i").test(text));
  const clauses = ["non-compete", "non-solicit", "bond", "clawback", "background verification", "confidentiality", "termination", "relocation"].filter((c) => new RegExp(c, "i").test(text)).map((c) => ({ title: c, text: near(new RegExp(c)) ?? c, note: null as string | null }));
  return {
    fixedCtc: fixed,
    variablePay: variable,
    joiningBonus: joining,
    noticePeriodDays: notice ? Number(notice[1]) * (/month/i.test(notice[2]) ? 30 : 1) : null,
    probationMonths: probation ? Number(probation[1]) : null,
    joiningDate: doj?.[2] ?? null,
    benefits,
    clauses,
  };
}

export async function analyzeOfferLetter(db: Database, userId: string, file: { name: string; mime: string; data: Buffer }, meta: { company: string; roleTitle?: string | null; applicationId?: string | null }) {
  const err = validateUpload(file.name, file.mime, file.data);
  if (err) throw new Error(err);
  const text = await extractText(file.data, file.mime);
  const rules = extractOfferRules(text);
  let ai: any = null;
  const provider = aiFor(db, userId);
  if (provider) {
    try {
      ai = (
        await provider.generateJson({
          feature: "offer.extract",
          userId,
          schema: offerExtractionSchema,
          system: "Extract compensation and terms from an offer letter exactly as written. Annual amounts in rupees as numbers. Use null for anything not stated. For each notable clause, add a short neutral note on what to check (not legal advice).",
          prompt: untrusted("offer_letter", text, 20000),
          temperature: 0,
        })
      ).data;
    } catch {
      ai = null;
    }
  }
  const pick = <T>(a: T | null | undefined, b: T | null | undefined) => (a !== null && a !== undefined ? a : b ?? null);
  const fields = {
    fixedCtc: pick(ai?.fixedCtc, rules.fixedCtc),
    variablePay: pick(ai?.variablePay, rules.variablePay),
    joiningBonus: pick(ai?.joiningBonus, rules.joiningBonus),
    otherBonus: ai?.otherBonus ?? null,
    noticePeriodDays: pick(ai?.noticePeriodDays, rules.noticePeriodDays),
    probationMonths: pick(ai?.probationMonths, rules.probationMonths),
    joiningDate: pick(ai?.joiningDate, rules.joiningDate),
    benefits: ai?.benefits?.length ? ai.benefits : rules.benefits,
    clauses: ai?.clauses?.length ? ai.clauses : rules.clauses,
    location: ai?.location ?? null,
  };
  const missing = Object.entries({ fixedCtc: "Fixed CTC", variablePay: "Variable pay", joiningDate: "Joining date", probationMonths: "Probation", noticePeriodDays: "Notice period" })
    .filter(([k]) => (fields as any)[k] === null)
    .map(([, v]) => v);
  const joinDate = fields.joiningDate && !isNaN(new Date(fields.joiningDate).getTime()) ? new Date(fields.joiningDate).toISOString().slice(0, 10) : null;
  return db.withUser(userId, async (tx) => {
    const doc = await saveDocument(tx, userId, { kind: "offer_letter", title: file.name, fileName: file.name, mime: file.mime, data: file.data, applicationId: meta.applicationId ?? null, sensitive: true });
    const offer = await tx.one<{ id: string }>(
      `insert into offers (user_id, application_id, document_id, company, role_title, fixed_ctc, variable_pay, joining_bonus, other_bonus, benefits, joining_date, probation_months, notice_period_days, location, clauses, missing_fields)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11::date,$12,$13,$14,$15::jsonb,$16::text[]) returning id`,
      [userId, meta.applicationId ?? null, doc.id, meta.company, meta.roleTitle ?? ai?.roleTitle ?? null, fields.fixedCtc, fields.variablePay, fields.joiningBonus, fields.otherBonus, fields.benefits, joinDate, fields.probationMonths, fields.noticePeriodDays, fields.location, JSON.stringify(fields.clauses), missing],
    );
    for (const c of ai?.components ?? []) await tx.query("insert into compensation_components (user_id, offer_id, name, annual_amount, kind) values ($1,$2,$3,$4,$5)", [userId, offer!.id, c.name, c.annualAmount, c.kind]);
    return { id: offer!.id, fields, missing, method: ai ? "rules+ai" : "rules" };
  });
}

export async function saveManualOffer(tx: Tx, userId: string, o: { company: string; roleTitle?: string | null; fixedCtc?: number | null; variablePay?: number | null; joiningBonus?: number | null; benefits?: string[]; joiningDate?: string | null; noticePeriodDays?: number | null; location?: string | null; applicationId?: string | null }) {
  const r = await tx.one<{ id: string }>(
    `insert into offers (user_id, application_id, company, role_title, fixed_ctc, variable_pay, joining_bonus, benefits, joining_date, notice_period_days, location)
     values ($1,$2,$3,$4,$5,$6,$7,$8::text[],$9::date,$10,$11) returning id`,
    [userId, o.applicationId ?? null, o.company, o.roleTitle ?? null, o.fixedCtc ?? null, o.variablePay ?? null, o.joiningBonus ?? null, o.benefits ?? [], o.joiningDate || null, o.noticePeriodDays ?? null, o.location ?? null],
  );
  return r!.id;
}

export const NEGOTIATION_TIPS = [
  "Anchor on your researched range and the value you bring, not on personal needs.",
  "Ask for the full CTC breakup (fixed, variable, PF, gratuity, insurance) before comparing offers.",
  "Negotiate fixed pay first; variable pay is usually not guaranteed.",
  "If fixed pay cannot move, ask about joining bonus, notice-period buyout, review timeline or title.",
  "Get every agreed change in a revised written offer.",
  "Be honest about competing offers; never invent one.",
];

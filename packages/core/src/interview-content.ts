/** Role guides for the Interview Studio. General knowledge only; examples are clearly hypothetical. */
export interface RoleGuide {
  slug: string;
  role: string;
  fundamentals: string[];
  advanced: string[];
  exercises: string[];
  example: string;
  questions: { q: string; category: "behavioral" | "technical" | "scenario" | "hr" | "managerial"; guidance: string }[];
}

export const ROLE_GUIDES: RoleGuide[] = [
  {
    slug: "business-analyst",
    role: "Business Analyst",
    fundamentals: ["Requirements gathering: stakeholders, interviews, workshops, BRD/FRD, user stories with acceptance criteria", "Process mapping (as-is / to-be), SOPs, flowcharts, BPMN basics", "SQL for analysis: joins, group by, window functions; Excel pivots and lookups", "KPIs: definition, owner, data source, refresh frequency", "Gap analysis and prioritisation (MoSCoW, impact vs effort)"],
    advanced: ["Translating ambiguous asks into measurable outcomes", "Change management and UAT planning", "Cost-benefit analysis and business cases", "Working with engineering in Agile sprints (backlog grooming, refinement)"],
    exercises: ["Write 5 user stories with acceptance criteria for a merchant onboarding portal", "Map the as-is and to-be process for refund handling", "Write SQL to find the top 10 merchants by monthly growth"],
    example: "Hypothetical: a lending team says approvals are slow. A BA maps each step, measures time per step, finds a manual document check taking 60% of the time, and proposes an automated validation with clear acceptance criteria.",
    questions: [
      { q: "How do you gather requirements from stakeholders who disagree?", category: "behavioral", guidance: "Show listening, documenting each view, tying back to the business goal, and getting a decision owner." },
      { q: "Walk me through a process you improved. What changed and how did you measure it?", category: "behavioral", guidance: "Use STAR. Include the before/after metric only if you really measured it." },
      { q: "What is the difference between a BRD and an FRD?", category: "technical", guidance: "BRD = business need and scope; FRD = how the system must behave to meet it." },
      { q: "How would you write acceptance criteria for a 'download statement' feature?", category: "technical", guidance: "Given/When/Then, edge cases (no transactions, large date ranges), formats, permissions." },
      { q: "A stakeholder wants a feature tomorrow that you think is wrong. What do you do?", category: "scenario", guidance: "Clarify the underlying need, show impact/risks with data, offer an alternative, escalate respectfully." },
    ],
  },
  {
    slug: "data-analyst",
    role: "Data Analyst",
    fundamentals: ["SQL: joins, aggregations, CTEs, window functions (ROW_NUMBER, LAG), date handling", "Excel: pivots, XLOOKUP, conditional formatting, Power Query basics", "Visualisation: choosing the right chart; dashboard design for decisions", "Statistics: averages vs medians, distributions, correlation vs causation, basic A/B testing", "Data cleaning: duplicates, nulls, outliers, consistent definitions"],
    advanced: ["Cohort and funnel analysis", "Metric definitions and a single source of truth", "Root cause analysis with segmentation", "Python (pandas) for repeatable analysis"],
    exercises: ["SQL: monthly active merchants and month-over-month change", "Find why conversion dropped last week using a funnel breakdown", "Build a one-page dashboard spec for a payments ops head"],
    example: "Hypothetical: revenue fell 8%. The analyst splits it into orders × average order value, finds AOV is flat but orders fell in one city after an app update, and confirms with app-version data.",
    questions: [
      { q: "Explain the difference between WHERE and HAVING.", category: "technical", guidance: "WHERE filters rows before grouping; HAVING filters groups after aggregation." },
      { q: "How would you find duplicate transactions in a table?", category: "technical", guidance: "GROUP BY the identifying columns HAVING COUNT(*) > 1, or ROW_NUMBER() over a partition." },
      { q: "A metric suddenly dropped 20%. How do you investigate?", category: "scenario", guidance: "Check data pipeline first, then segment (time, channel, region, platform), compare to baseline, form and test hypotheses." },
      { q: "Tell me about a dashboard or report you built. Who used it and what decision did it support?", category: "behavioral", guidance: "Focus on the user, the decision, and adoption. Only real examples." },
      { q: "When would you use a median instead of a mean?", category: "technical", guidance: "Skewed data or outliers (e.g. transaction values)." },
    ],
  },
  {
    slug: "business-operations",
    role: "Business Operations",
    fundamentals: ["Process ownership: SLAs/TATs, queues, capacity planning", "KPI tracking and weekly business reviews", "Vendor and partner coordination", "Escalation management and root cause analysis", "Excel/SQL for ops reporting"],
    advanced: ["Designing scalable processes and automation", "Cross-functional programme management", "Unit economics and cost optimisation", "Building ops dashboards with leading indicators"],
    exercises: ["Design an SLA dashboard for a 20-person ops team", "Write an RCA for a missed SLA week", "Propose 3 automation candidates from a manual process"],
    example: "Hypothetical: onboarding TAT slipped from 3 to 7 days. Ops maps stages, finds document rework is the bottleneck, introduces a pre-submission checklist and cuts rework.",
    questions: [
      { q: "How do you prioritise when multiple escalations arrive at once?", category: "behavioral", guidance: "Impact, urgency, customer/revenue at risk, regulatory exposure; communicate ETAs." },
      { q: "Which operations metrics would you track for a merchant onboarding team?", category: "technical", guidance: "TAT by stage, first-time-right rate, rework rate, backlog age, activation rate." },
      { q: "Tell me about a time you improved a process.", category: "behavioral", guidance: "STAR, real numbers only if measured." },
      { q: "How do you handle a partner who keeps missing SLAs?", category: "scenario", guidance: "Data-backed review, root cause, joint action plan, escalation path, contractual levers." },
    ],
  },
  {
    slug: "payments-operations",
    role: "Payments Operations",
    fundamentals: ["Payment flows: UPI, cards, net banking, wallets; acquirer, issuer, network, PSP roles", "Settlement cycles (T+1 etc.), MDR, refunds, chargebacks", "Reconciliation: matching transaction, settlement and bank records", "KYC/AML basics and RBI guidelines for payment aggregators", "POS: MID/TID, device mapping, terminal management"],
    advanced: ["Success-rate monitoring by bank/PSP and smart routing", "Chargeback representment and fraud signals", "Incident management for payment outages", "Automation of recon and exception handling"],
    exercises: ["Reconcile a sample settlement with refunds and chargebacks", "Write an incident update for a UPI success-rate drop", "List checks for onboarding a high-risk merchant"],
    example: "Hypothetical: UPI success rate fell in the evening. Ops splits failures by response code and bank, finds one issuer bank timing out, routes traffic and informs merchants.",
    questions: [
      { q: "Explain the UPI transaction flow.", category: "technical", guidance: "Payer app → PSP → NPCI → issuer bank debit → NPCI → acquirer/beneficiary bank credit → confirmations." },
      { q: "What is a chargeback and how is it handled?", category: "technical", guidance: "Cardholder dispute via issuer; merchant can accept or represent with evidence within timelines." },
      { q: "How would you reconcile settlements for a merchant?", category: "scenario", guidance: "Match on transaction IDs; bucket timing differences, refunds, chargebacks, fees, holds." },
      { q: "What is the difference between MID and TID?", category: "technical", guidance: "MID identifies the merchant with the acquirer; TID identifies each terminal under that merchant." },
      { q: "Describe how you handled a difficult merchant escalation.", category: "behavioral", guidance: "Real example, customer empathy, clear ownership, resolution and prevention." },
    ],
  },
  {
    slug: "fintech-operations",
    role: "FinTech Operations",
    fundamentals: ["Payments, lending or wealth product basics depending on the company", "Compliance: KYC, AML, RBI master directions relevant to the product", "Partner bank coordination", "Operational risk and controls", "Customer and merchant lifecycle operations"],
    advanced: ["Designing maker-checker controls", "Audit readiness and documentation", "Scaling operations with automation and tooling"],
    exercises: ["Draft a maker-checker process for refunds above a threshold", "List KYC documents and checks for a sole proprietor merchant"],
    example: "Hypothetical: an audit finds missing KYC documents for 2% of merchants. Ops builds a tracker, contacts merchants, restricts limits until complete, and fixes the onboarding gate.",
    questions: [
      { q: "Why is KYC important and what are common KYC checks?", category: "technical", guidance: "Identity, address, business proof, PAN/GST validation, beneficial ownership, sanctions screening." },
      { q: "How do you balance speed and compliance?", category: "behavioral", guidance: "Risk-based approach; never skip mandatory checks; automate the rest." },
      { q: "What would you do if you found a compliance gap in a process you own?", category: "scenario", guidance: "Escalate immediately, contain, fix root cause, document." },
    ],
  },
  {
    slug: "product-operations",
    role: "Product Operations",
    fundamentals: ["Product lifecycle and launch readiness", "Feedback loops between support, ops and product", "Release communication and enablement", "Product metrics and experimentation basics"],
    advanced: ["Operational readiness reviews", "Tooling and process for product teams at scale"],
    exercises: ["Create a launch checklist for a new payout feature", "Turn 50 support tickets into prioritised product feedback"],
    example: "Hypothetical: a new feature confuses users. Product ops clusters tickets, finds one unclear screen, and works with product on a copy fix and an FAQ.",
    questions: [
      { q: "How would you prepare operations for a new product launch?", category: "scenario", guidance: "Readiness checklist, training, SOPs, support macros, monitoring, rollback plan." },
      { q: "How do you turn customer feedback into product priorities?", category: "behavioral", guidance: "Collect, categorise, quantify impact, share with product with evidence." },
    ],
  },
  {
    slug: "operations-analyst",
    role: "Operations Analyst",
    fundamentals: ["Excel and SQL reporting", "Process metrics and variance analysis", "Root cause analysis", "Data quality checks"],
    advanced: ["Forecasting volumes and staffing", "Automating recurring reports"],
    exercises: ["Build a weekly ops report with WoW changes", "Find the top 3 drivers of SLA breaches from sample data"],
    example: "Hypothetical: weekly report takes 4 hours. The analyst automates it with Power Query and SQL, adding checks against control totals.",
    questions: [
      { q: "How do you ensure your reports are accurate?", category: "behavioral", guidance: "Reconcile to control totals, peer review, documented definitions." },
      { q: "Explain a VLOOKUP vs XLOOKUP vs INDEX-MATCH.", category: "technical", guidance: "Lookup direction, exact match defaults, flexibility." },
    ],
  },
  {
    slug: "hr-round",
    role: "HR Interviews",
    fundamentals: ["Tell me about yourself (60–90 seconds: present, past, why this role)", "Why this company / role", "Strengths and weaknesses with real examples", "Career goals", "Salary expectations and notice period", "Reasons for job change (positive framing)"],
    advanced: ["Handling career gaps honestly", "Negotiation basics", "Questions to ask the interviewer"],
    exercises: ["Write and time your 'Tell me about yourself'", "Prepare 3 STAR stories you can adapt"],
    example: "Hypothetical answer structure for 'Why are you leaving?': what you learned, what you want next, and how this role offers it — without criticising your employer.",
    questions: [
      { q: "Tell me about yourself.", category: "hr", guidance: "Present role and impact → relevant past → why this role now. 60–90 seconds." },
      { q: "Why do you want to change your job?", category: "hr", guidance: "Growth-focused, specific, no negativity." },
      { q: "What are your salary expectations?", category: "hr", guidance: "Give a researched range from your profile; mention flexibility on total package." },
      { q: "What is your biggest weakness?", category: "hr", guidance: "A real, non-critical weakness and what you are doing about it." },
      { q: "Where do you see yourself in 3 years?", category: "hr", guidance: "Aligned with the role's growth path." },
      { q: "Why should we hire you?", category: "hr", guidance: "Map 2–3 verified strengths to the role's top requirements." },
    ],
  },
];

export const MOCK_TYPE_QUESTIONS: Record<string, string[]> = {
  hr: ["Tell me about yourself.", "Why are you interested in this role?", "Why do you want to change jobs?", "What are your strengths?", "What are your salary expectations and notice period?"],
  behavioral: ["Tell me about a time you handled a difficult stakeholder.", "Describe a time you made a mistake at work and what you did.", "Tell me about a time you improved a process.", "Describe a situation where you had to meet a tight deadline.", "Tell me about a time you disagreed with your manager."],
  managerial: ["How do you prioritise competing tasks?", "How would you handle a team member who keeps missing deadlines?", "How do you communicate bad news to stakeholders?", "How do you decide what to automate?", "How do you measure the success of a process?"],
  technical: ["Explain the difference between WHERE and HAVING in SQL.", "How would you find duplicate records in a table?", "How do you build a pivot table to summarise transactions by month and status?", "What is a window function? Give an example.", "How would you check data quality before publishing a report?"],
  scenario: ["UPI success rate dropped from 96% to 81% this evening. What do you do?", "A merchant says their settlement is short by ₹3 lakh. How do you investigate?", "Onboarding TAT has doubled in two months. How do you diagnose it?", "Two dashboards show different numbers for the same metric. What do you do?"],
  resume: [],
  company: [],
};

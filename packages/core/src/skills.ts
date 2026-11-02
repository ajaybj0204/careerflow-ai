import { canonicalSkill, detectSkills, learningPlanSchema } from "@careerflow/shared";
import type { Database, Tx } from "@careerflow/database";
import { aiFor } from "./ai";
import { getCareerContext, renderCareerContext } from "./career-memory";
import { guideForRole } from "./interview";

export interface Exercise {
  id: string;
  skill: "SQL" | "Excel" | "Python" | "Aptitude" | "Analytical Reasoning" | "Business Case" | "Process Analysis";
  level: "beginner" | "intermediate" | "advanced";
  prompt: string;
  options?: string[];
  /** index of correct option for MCQ, or a number for numeric answers */
  answer: number;
  tolerance?: number;
  explanation: string;
}

export const EXERCISES: Exercise[] = [
  { id: "sql-1", skill: "SQL", level: "beginner", prompt: "Which clause filters groups after aggregation?", options: ["WHERE", "HAVING", "ORDER BY", "LIMIT"], answer: 1, explanation: "HAVING filters aggregated groups; WHERE filters rows before grouping." },
  { id: "sql-2", skill: "SQL", level: "beginner", prompt: "Which join returns all rows from the left table and matching rows from the right?", options: ["INNER JOIN", "LEFT JOIN", "CROSS JOIN", "SELF JOIN"], answer: 1, explanation: "LEFT JOIN keeps every left row; unmatched right columns are NULL." },
  { id: "sql-3", skill: "SQL", level: "intermediate", prompt: "transactions(id, merchant_id, amount). Which query finds merchants with more than 100 transactions?", options: ["SELECT merchant_id FROM transactions WHERE COUNT(*) > 100", "SELECT merchant_id FROM transactions GROUP BY merchant_id HAVING COUNT(*) > 100", "SELECT merchant_id, COUNT(*) FROM transactions HAVING id > 100", "SELECT DISTINCT merchant_id FROM transactions LIMIT 100"], answer: 1, explanation: "Group by merchant, then filter groups with HAVING COUNT(*) > 100." },
  { id: "sql-4", skill: "SQL", level: "intermediate", prompt: "Which window function numbers rows within each merchant by date (1, 2, 3…) with no ties?", options: ["RANK()", "DENSE_RANK()", "ROW_NUMBER()", "NTILE(4)"], answer: 2, explanation: "ROW_NUMBER() gives a unique sequence per partition." },
  { id: "sql-5", skill: "SQL", level: "advanced", prompt: "To compare each day's volume with the previous day's in the same query, you would use:", options: ["LAG(volume) OVER (ORDER BY day)", "SUM(volume) GROUP BY day", "MAX(volume) OVER ()", "COALESCE(volume, 0)"], answer: 0, explanation: "LAG reads the previous row's value in the window order." },
  { id: "sql-6", skill: "SQL", level: "intermediate", prompt: "A table has 3 rows with amount 100, NULL and 300. What does AVG(amount) return?", answer: 200, explanation: "AVG ignores NULLs: (100 + 300) / 2 = 200." },
  { id: "xl-1", skill: "Excel", level: "beginner", prompt: "Which function returns a value from another table by matching a key, searching in any direction, with exact match by default?", options: ["VLOOKUP", "XLOOKUP", "HLOOKUP", "MATCH"], answer: 1, explanation: "XLOOKUP looks left or right and defaults to an exact match." },
  { id: "xl-2", skill: "Excel", level: "beginner", prompt: "Best tool to summarise 50,000 transactions by month and status without formulas:", options: ["Conditional formatting", "Pivot table", "Data validation", "Freeze panes"], answer: 1, explanation: "Pivot tables aggregate large data quickly." },
  { id: "xl-3", skill: "Excel", level: "intermediate", prompt: "=SUMIFS(C:C, A:A, \"UPI\", B:B, \">1000\") adds C where:", options: ["A is UPI OR B > 1000", "A is UPI AND B > 1000", "Only A is UPI", "Only B > 1000"], answer: 1, explanation: "SUMIFS applies all criteria together (AND)." },
  { id: "xl-4", skill: "Excel", level: "intermediate", prompt: "To repeat the same cleaning steps on a new monthly file, the best feature is:", options: ["Copy-paste values", "Power Query", "Text to Columns", "Flash Fill"], answer: 1, explanation: "Power Query records refreshable transformation steps." },
  { id: "py-1", skill: "Python", level: "beginner", prompt: "What does len([3, 1, 4, 1, 5]) return?", answer: 5, explanation: "The list has five elements." },
  { id: "py-2", skill: "Python", level: "intermediate", prompt: "In pandas, which removes duplicate rows?", options: ["df.dropna()", "df.drop_duplicates()", "df.unique()", "df.fillna()"], answer: 1, explanation: "drop_duplicates() removes repeated rows." },
  { id: "py-3", skill: "Python", level: "intermediate", prompt: "In pandas, total amount per merchant is:", options: ["df.sum('merchant')", "df.groupby('merchant')['amount'].sum()", "df['amount'].groupby()", "df.pivot('amount')"], answer: 1, explanation: "Group by the key and aggregate the column." },
  { id: "py-4", skill: "Python", level: "beginner", prompt: "What is sum(x * 2 for x in [1, 2, 3])?", answer: 12, explanation: "2 + 4 + 6 = 12." },
  { id: "apt-1", skill: "Aptitude", level: "beginner", prompt: "A merchant processed ₹2,40,000 in 12 days. At the same rate, how much (₹) in 30 days?", answer: 600000, explanation: "₹20,000 per day × 30 = ₹6,00,000." },
  { id: "apt-2", skill: "Aptitude", level: "beginner", prompt: "Success rate rose from 80% to 92%. What is the increase in percentage points?", answer: 12, explanation: "92 − 80 = 12 percentage points (a 15% relative increase)." },
  { id: "apt-3", skill: "Aptitude", level: "intermediate", prompt: "MDR is 1.8% on ₹50,000 plus 18% GST on the MDR. Total deduction in ₹?", answer: 1062, explanation: "MDR ₹900; GST ₹162; total ₹1,062." },
  { id: "apt-4", skill: "Aptitude", level: "intermediate", prompt: "A team clears 120 tickets/day with 6 people. How many people are needed for 200 tickets/day at the same productivity?", answer: 10, explanation: "20 tickets per person per day; 200 / 20 = 10." },
  { id: "apt-5", skill: "Aptitude", level: "advanced", prompt: "Revenue = customers × orders per customer × AOV. Customers +10%, orders/customer −10%, AOV unchanged. Revenue change in %? (one decimal)", answer: -1, tolerance: 0.05, explanation: "1.1 × 0.9 = 0.99 → −1.0%." },
  { id: "ar-1", skill: "Analytical Reasoning", level: "beginner", prompt: "Sales went up in the same month as ice-cream sales. What can you conclude?", options: ["Ice cream causes sales", "They are correlated; causation needs more evidence", "Sales cause ice cream sales", "Nothing at all"], answer: 1, explanation: "Correlation is not causation; look for a shared driver such as season." },
  { id: "ar-2", skill: "Analytical Reasoning", level: "intermediate", prompt: "Average transaction value is ₹900 but the median is ₹300. This suggests:", options: ["Data is symmetric", "A few very large transactions skew the average", "Most transactions are above ₹900", "The data has no outliers"], answer: 1, explanation: "Mean far above median indicates right skew from large values." },
  { id: "bc-1", skill: "Business Case", level: "intermediate", prompt: "First step when a key metric suddenly drops:", options: ["Announce a fix", "Validate the data and definitions", "Change the dashboard", "Blame seasonality"], answer: 1, explanation: "Rule out data/tracking issues before analysing business causes." },
  { id: "bc-2", skill: "Business Case", level: "advanced", prompt: "Automation costs ₹3,00,000 and saves 4 hours/day at ₹500/hour (22 working days/month). Payback period in months? (one decimal)", answer: 6.8, tolerance: 0.1, explanation: "Savings ₹44,000/month; 3,00,000 / 44,000 ≈ 6.8 months." },
  { id: "pa-1", skill: "Process Analysis", level: "beginner", prompt: "In a 4-step process, step times are 10, 45, 15 and 5 minutes. Which step is the bottleneck?", options: ["Step 1", "Step 2", "Step 3", "Step 4"], answer: 1, explanation: "The slowest step (45 min) limits throughput." },
  { id: "pa-2", skill: "Process Analysis", level: "intermediate", prompt: "20% of applications are sent back for missing documents. The most effective fix is usually:", options: ["Hire more reviewers", "A checklist/validation before submission", "Longer SLAs", "Weekly reports"], answer: 1, explanation: "Preventing rework at the source beats adding capacity." },
];

export function checkExercise(id: string, response: number) {
  const ex = EXERCISES.find((e) => e.id === id);
  if (!ex) throw new Error("Exercise not found");
  const correct = ex.options ? response === ex.answer : Math.abs(response - ex.answer) <= (ex.tolerance ?? 0.0001) * Math.max(1, Math.abs(ex.answer));
  return { correct, explanation: ex.explanation, answer: ex.options ? ex.options[ex.answer] : String(ex.answer) };
}

export async function recordExercise(tx: Tx, userId: string, id: string, response: number) {
  const r = checkExercise(id, response);
  const ex = EXERCISES.find((e) => e.id === id)!;
  await tx.query("insert into skill_progress (user_id, skill, activity_type, activity_ref, correct) values ($1,$2,'exercise',$3,$4)", [userId, ex.skill, id, r.correct]);
  return r;
}

/** Skills that appear in the user's saved JDs or target-role guides but are not verified. */
export async function skillGapAnalysis(tx: Tx) {
  const ctx = await getCareerContext(tx);
  const verified = new Set(ctx.skills.map((s) => canonicalSkill(s.name)));
  const jds = await tx.query<{ job_description: string }>("select job_description from applications where job_description is not null and status not in ('rejected','withdrawn') order by created_at desc limit 40");
  const freq = new Map<string, number>();
  for (const j of jds) for (const s of new Set(detectSkills(j.job_description))) freq.set(s, (freq.get(s) ?? 0) + 1);
  const gaps = [...freq.entries()].filter(([s]) => !verified.has(s)).sort((a, b) => b[1] - a[1]).map(([skill, count]) => ({ skill, count, source: `${count} of ${jds.length} saved job descriptions` }));
  const weaknesses = await tx.query("select topic, source, evidence, status from weaknesses where status <> 'resolved' order by updated_at desc");
  const progress = await tx.query("select skill, count(*)::int as done, count(*) filter (where correct)::int as correct, max(completed_at) as last from skill_progress group by skill order by last desc");
  return { gaps, weaknesses, progress, jdCount: jds.length, verifiedSkills: [...verified] };
}

const RESOURCES: Record<string, string> = {
  SQL: "https://sqlbolt.com/",
  Excel: "https://support.microsoft.com/en-us/excel",
  "Power BI": "https://learn.microsoft.com/en-us/training/powerplatform/power-bi",
  Python: "https://docs.python.org/3/tutorial/",
  Pandas: "https://pandas.pydata.org/docs/getting_started/intro_tutorials/",
  Tableau: "https://www.tableau.com/learn/training",
  Statistics: "https://www.khanacademy.org/math/statistics-probability",
  UPI: "https://www.npci.org.in/what-we-do/upi/product-overview",
  "Data Visualization": "https://www.kaggle.com/learn/data-visualization",
  "Machine Learning": "https://www.kaggle.com/learn/intro-to-machine-learning",
};

/** Builds a learning path (7/30/90/custom days). Rules by default; AI personalises when configured. */
export async function createLearningPath(db: Database, userId: string, input: { days: number; goal?: string; level: "beginner" | "intermediate" | "advanced"; focus?: string[] }) {
  const days = Math.max(3, Math.min(180, Math.round(input.days)));
  const { gaps, ctx } = await db.withUser(userId, async (tx) => ({ gaps: await skillGapAnalysis(tx), ctx: await getCareerContext(tx) }));
  const focus = (input.focus?.length ? input.focus : [...gaps.gaps.slice(0, 4).map((g) => g.skill), ...gaps.weaknesses.slice(0, 2).map((w) => w.topic)]).slice(0, 6);
  const role = ctx.profile.targetRoles[0] ?? null;
  const guide = guideForRole(role);
  let title = `${days}-day plan${input.goal ? `: ${input.goal}` : role ? ` for ${role}` : ""}`;
  let modules: { day: number; title: string; description: string; kind: "lesson" | "practice" | "project" | "review" | "assessment"; skill: string | null }[] = [];
  let generatedBy: "rules" | "ai" = "rules";

  const ai = aiFor(db, userId);
  if (ai) {
    try {
      const { data } = await ai.generateJson({
        feature: "skills.learning_path",
        userId,
        schema: learningPlanSchema,
        system: `Create a realistic ${days}-day learning plan at ${input.level} level. Use about one module per day for plans up to 30 days, and 3–4 per week for longer plans. Mix lessons, practice, small projects and reviews. Be specific and practical. Day numbers from 1 to ${days}.`,
        prompt: [renderCareerContext(ctx), `Goal: ${input.goal ?? "interview readiness for target roles"}`, `Focus areas: ${focus.join(", ") || "role fundamentals"}`, guide ? `Role fundamentals: ${guide.fundamentals.join("; ")}` : ""].join("\n\n"),
        temperature: 0.5,
      });
      title = data.title;
      modules = data.modules.filter((m) => m.day >= 1 && m.day <= days);
      generatedBy = "ai";
    } catch {
      /* fall back */
    }
  }
  if (!modules.length) {
    const topics = [...focus, ...(guide?.fundamentals.slice(0, 4) ?? []), "Interview practice"].filter(Boolean);
    const step = days <= 30 ? 1 : 2;
    let t = 0;
    for (let d = 1; d <= days; d += step) {
      const topic = topics[t % topics.length];
      const cycle = Math.floor(t / topics.length);
      const kind = d === days ? "assessment" : d % 7 === 0 ? "review" : cycle % 2 === 0 ? "lesson" : "practice";
      modules.push({
        day: d,
        title: kind === "review" ? "Weekly review" : kind === "assessment" ? "Final self-assessment" : `${kind === "lesson" ? "Learn" : "Practise"}: ${topic}`,
        description:
          kind === "review"
            ? "Revisit this week's topics, redo any exercises you got wrong, and note what is still unclear."
            : kind === "assessment"
              ? "Take the practice exercises again and run a mock interview to check progress."
              : kind === "lesson"
                ? `Study the core concepts of ${topic} (45–60 minutes). Write short notes in your own words.`
                : `Solve practice problems or a mini task on ${topic}. Use Skills Academy exercises where available.`,
        kind: kind as any,
        skill: kind === "review" || kind === "assessment" ? null : topic,
      });
      t++;
    }
    if (days > 20) modules.push({ day: Math.round(days * 0.7), title: "Mini project", description: `Build a small, real project applying ${focus[0] ?? "what you learned"} (e.g. a dashboard or analysis on public data). Only mark it completed in your profile when it is actually done.`, kind: "project", skill: focus[0] ?? null });
  }
  return db.withUser(userId, async (tx) => {
    const p = await tx.one<{ id: string }>("insert into learning_paths (user_id, title, goal, duration_days, level, generated_by) values ($1,$2,$3,$4,$5,$6) returning id", [userId, title.slice(0, 200), input.goal ?? null, days, input.level, generatedBy]);
    for (const [i, m] of modules.sort((a, b) => a.day - b.day).entries())
      await tx.query("insert into learning_modules (user_id, path_id, day, sort_order, title, description, kind, skill, resource_url) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
        userId,
        p!.id,
        m.day,
        i,
        m.title.slice(0, 200),
        m.description.slice(0, 1000),
        m.kind,
        m.skill,
        m.skill ? RESOURCES[canonicalSkill(m.skill)] ?? null : null,
      ]);
    return { id: p!.id, modules: modules.length, generatedBy };
  });
}

export async function toggleModule(tx: Tx, userId: string, moduleId: string, done: boolean) {
  const m = await tx.one("update learning_modules set completed_at = case when $2 then now() else null end where id = $1 returning *", [moduleId, done]);
  if (m && done) await tx.query("insert into skill_progress (user_id, skill, activity_type, activity_ref) values ($1,$2,'module',$3)", [userId, m.skill ?? "General", moduleId]);
  if (m && !done) await tx.query("delete from skill_progress where activity_type = 'module' and activity_ref = $1", [moduleId]);
  const left = m ? await tx.one<{ n: number }>("select count(*)::int as n from learning_modules where path_id = $1 and completed_at is null", [m.path_id]) : null;
  if (m) await tx.query("update learning_paths set status = case when $2 = 0 then 'completed' else 'active' end where id = $1", [m.path_id, left?.n ?? 1]);
}

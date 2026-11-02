import Link from "next/link";
import { canonicalSkill } from "@careerflow/shared";
import { getCareerContext, guideForRole, ROLE_GUIDES } from "@careerflow/core";
import { detectSkills } from "@careerflow/shared";
import { Card, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";

export const metadata = { title: "Experienced Professional Tools" };

const LEADERSHIP = [
  "Tell me about a time you led a team through a difficult change.",
  "How do you handle an underperforming team member?",
  "Describe a decision you made with incomplete data.",
  "How have you influenced stakeholders without authority?",
  "Tell me about a process you scaled.",
  "What is the most difficult escalation you managed?",
];

export default async function CareerTools({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  const ctx = await withUser((tx) => getCareerContext(tx));
  const target = sp.role ?? ctx.profile.targetRoles[0] ?? "Business Analyst";
  const guide = guideForRole(target);
  const required = new Set(guide ? detectSkills([...guide.fundamentals, ...guide.advanced].join("\n")) : []);
  const mine = new Set(ctx.skills.map((s) => canonicalSkill(s.name)));
  const transferable = [...mine].filter((s) => required.has(s));
  const toBuild = [...required].filter((s) => !mine.has(s));
  const sorted = [...ctx.employment].sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
  const gaps: string[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].end;
    const start = sorted[i].start;
    if (prevEnd && start) {
      const months = (new Date(start).getTime() - new Date(prevEnd).getTime()) / (30 * 864e5);
      if (months >= 3) gaps.push(`${Math.round(months)} months between ${sorted[i - 1].company} and ${sorted[i].company}`);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Experienced Professional Tools" description="Career transitions, transferable skills, role progression, leadership questions and career-gap explanations — from your verified history." />
      <form className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="role">
            Target role
          </label>
          <select id="role" name="role" defaultValue={guide?.role ?? target} className="input">
            {ROLE_GUIDES.filter((g) => g.slug !== "hr-round").map((g) => (
              <option key={g.slug}>{g.role}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-secondary">Map skills</button>
      </form>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Transferable skills mapping" description={`Your verified skills vs the fundamentals of ${guide?.role ?? target}.`}>
          <p className="text-sm font-medium text-good">You already have</p>
          <p className="text-sm text-ink-2">{transferable.join(", ") || "None mapped yet — verify your skills in your profile."}</p>
          <p className="mt-3 text-sm font-medium text-warn">To build or evidence</p>
          <p className="text-sm text-ink-2">{toBuild.join(", ") || "Nothing obvious from the role guide."}</p>
          <Link href="/app/skills" className="btn btn-secondary btn-sm mt-3">
            Create a learning plan
          </Link>
        </Card>
        <Card title="Role progression">
          {sorted.length ? (
            <ol className="relative space-y-3 border-l border-line pl-5 text-sm">
              {sorted.map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-accent" />
                  <p className="font-medium">{e.title}</p>
                  <p className="text-ink-2">
                    {e.company} · {e.start ?? "?"} – {e.current ? "present" : e.end ?? "?"}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-ink-2">Verify your employment history to see your progression.</p>
          )}
        </Card>
        <Card title="Career gap explanation">
          {gaps.length ? (
            <>
              <ul className="list-disc pl-5 text-sm text-ink-2">
                {gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-ink-2">Explain gaps briefly and honestly: what you did (learning, family, health, projects) and why you are ready now.</p>
            </>
          ) : (
            <p className="text-sm text-ink-2">No gaps of 3+ months found in your verified history.</p>
          )}
          <Link href={`/app/copilot?q=${encodeURIComponent("How do I explain the gap in my career?")}`} className="btn btn-secondary btn-sm mt-3">
            Draft an explanation
          </Link>
        </Card>
        <Card title="Leadership and senior-role questions">
          <ul className="space-y-1.5 text-sm text-ink-2">
            {LEADERSHIP.map((q) => (
              <li key={q}>
                <Link href={`/app/copilot?q=${encodeURIComponent(q)}`} className="hover:text-accent">
                  {q}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/app/interview?mock=managerial" className="btn btn-secondary btn-sm mt-3">
            Managerial mock interview
          </Link>
        </Card>
      </div>
    </div>
  );
}

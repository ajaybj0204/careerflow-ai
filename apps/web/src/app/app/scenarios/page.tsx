import Link from "next/link";
import { ResultPanel } from "@/components/forms";
import { Badge, Card, fmtDate, Notice, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { scenarioAction } from "../_actions/interview";

export const metadata = { title: "Scenario Lab" };

export default async function Scenarios({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  const d = await withUser(async (tx) => ({
    list: await tx.query("select s.*, (select count(*)::int from scenario_attempts a where a.scenario_id = s.id) as attempts from interview_scenarios s order by s.domain, s.title"),
    attempts: sp.id ? await tx.query("select * from scenario_attempts where scenario_id = $1 order by created_at desc limit 5", [sp.id]) : [],
  }));
  const sc = d.list.find((s: any) => s.id === sp.id);
  return (
    <div className="space-y-6">
      <PageHeader title="Industry Scenario Lab" description="Realistic, hypothetical problems from payments, operations and analytics. Explain how you would solve them and compare with a structured model approach." />
      <Notice tone="info">These scenarios are practice only. Nothing you write here is added to your profile as real experience.</Notice>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Scenarios">
          <ul className="space-y-1">
            {d.list.map((s: any) => (
              <li key={s.id}>
                <Link href={`/app/scenarios?id=${s.id}`} className={`block rounded-lg px-2 py-2 text-sm ${s.id === sp.id ? "bg-accent-soft" : "hover:bg-surface-2"}`}>
                  <span className="font-medium">{s.title}</span>
                  <span className="block text-xs text-muted">
                    {s.domain} · {s.difficulty}
                    {s.attempts ? ` · ${s.attempts} attempt(s)` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          {sc ? (
            <>
              <Card title={sc.title} actions={<Badge>{sc.domain}</Badge>}>
                <p className="text-sm">{sc.situation}</p>
                <p className="mt-2 text-sm font-medium">{sc.task}</p>
              </Card>
              <Card title="Your approach">
                <ResultPanel action={scenarioAction} kind="scenario" submitLabel="Get feedback" pendingText="Reviewing…">
                  <input type="hidden" name="scenarioId" value={sc.id} />
                  <textarea name="answer" rows={10} className="input" placeholder="Walk through how you would investigate, decide, communicate and prevent it." required aria-label="Your approach" />
                </ResultPanel>
              </Card>
              {d.attempts.length > 0 && (
                <Card title="Previous attempts">
                  <ul className="space-y-2 text-sm">
                    {d.attempts.map((a: any) => (
                      <li key={a.id}>
                        {fmtDate(a.created_at, true)} · covered {Math.round((a.feedback?.coverage ?? 0) * 100)}% <span className="text-xs text-muted">({a.method})</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          ) : (
            <Card title="Pick a scenario">
              <p className="text-sm text-ink-2">Choose a problem on the left. Feedback compares your answer with a model approach; with AI configured you also get written, specific feedback.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

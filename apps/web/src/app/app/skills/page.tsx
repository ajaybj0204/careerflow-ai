import { ExternalLink } from "lucide-react";
import { EXERCISES, skillGapAnalysis } from "@careerflow/core";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client";
import { Badge, Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { withUser } from "@/lib/session";
import { deletePathAction, exerciseAction, learningPathAction, moduleAction } from "../_actions/interview";

export const metadata = { title: "Skills Academy" };

const SKILL_TABS = ["SQL", "Excel", "Python", "Aptitude", "Analytical Reasoning", "Business Case", "Process Analysis"];

export default async function Skills({ searchParams }: { searchParams: Promise<{ tab?: string; skill?: string; level?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab ?? "plan";
  const d = await withUser(async (tx) => ({
    gaps: await skillGapAnalysis(tx),
    paths: await tx.query("select p.*, coalesce(json_agg(m order by m.day, m.sort_order) filter (where m.id is not null), '[]') as modules from learning_paths p left join learning_modules m on m.path_id = p.id group by p.id order by p.created_at desc"),
    done: await tx.query<{ activity_ref: string; correct: boolean }>("select distinct on (activity_ref) activity_ref, correct from skill_progress where activity_type = 'exercise' order by activity_ref, completed_at desc"),
  }));
  const doneMap = new Map(d.done.map((x) => [x.activity_ref, x.correct]));
  const skill = SKILL_TABS.includes(sp.skill ?? "") ? sp.skill! : "SQL";
  const exercises = EXERCISES.filter((e) => e.skill === skill && (!sp.level || e.level === sp.level));
  return (
    <div className="space-y-6">
      <PageHeader title="Skills Academy" description="Close the gaps that show up in the jobs you want. Progress is counted only from activities you actually complete — no made-up skill scores." />
      <Tabs
        base="/app/skills"
        active={tab}
        tabs={[
          { id: "plan", label: "Learning plans" },
          { id: "gaps", label: "Skill gaps", count: d.gaps.gaps.length },
          { id: "practice", label: "Practice" },
          { id: "progress", label: "Progress" },
        ]}
      />
      {tab === "plan" && (
        <div className="space-y-6">
          <Card title="Create a learning plan">
            <ActionForm action={learningPathAction} className="grid gap-3 sm:grid-cols-5">
              <select name="days" className="input" defaultValue="30" aria-label="Duration">
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="custom">Custom</option>
              </select>
              <input name="customDays" type="number" min="3" max="180" className="input" placeholder="Custom days" aria-label="Custom days" />
              <select name="level" className="input" aria-label="Level">
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
              <input name="goal" className="input sm:col-span-2" placeholder="Goal, e.g. interview-ready for Data Analyst" />
              <input name="focus" className="input sm:col-span-4" placeholder={`Focus skills (default: your gaps — ${d.gaps.gaps.slice(0, 3).map((g) => g.skill).join(", ") || "role fundamentals"})`} />
              <SubmitButton>Create plan</SubmitButton>
            </ActionForm>
          </Card>
          {d.paths.length ? (
            d.paths.map((p: any) => {
              const done = p.modules.filter((m: any) => m.completed_at).length;
              return (
                <Card
                  key={p.id}
                  title={p.title}
                  description={`${done} of ${p.modules.length} done · ${p.level} · ${p.generated_by === "ai" ? "AI-personalised" : "rule-based"}`}
                  actions={
                    <>
                      <Badge tone={p.status === "completed" ? "good" : "info"}>{p.status}</Badge>
                      <ActionButton action={deletePathAction} fields={{ id: p.id }} className="btn btn-ghost btn-sm" confirm="Delete this plan?">
                        Delete
                      </ActionButton>
                    </>
                  }
                >
                  <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full bg-accent" style={{ width: `${p.modules.length ? (done / p.modules.length) * 100 : 0}%` }} />
                  </div>
                  <ul className="divide-y divide-line">
                    {p.modules.map((m: any) => (
                      <li key={m.id} className="flex items-start gap-3 py-2 text-sm">
                        <ActionButton action={moduleAction} fields={{ id: m.id, done: m.completed_at ? "0" : "1" }} className="btn btn-ghost btn-sm" title={m.completed_at ? "Mark not done" : "Mark done"}>
                          {m.completed_at ? "☑" : "☐"}
                        </ActionButton>
                        <span className="flex-1">
                          <span className={m.completed_at ? "text-muted line-through" : "font-medium"}>
                            Day {m.day}: {m.title}
                          </span>
                          <span className="block text-ink-2">{m.description}</span>
                        </span>
                        <Badge>{m.kind}</Badge>
                        {m.resource_url && (
                          <a href={m.resource_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" aria-label="Resource">
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })
          ) : (
            <EmptyState title="No learning plans yet">Create a 7, 30 or 90-day plan from your skill gaps.</EmptyState>
          )}
        </div>
      )}
      {tab === "gaps" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Skills the jobs you save ask for" description={`From ${d.gaps.jdCount} saved job description(s), compared with your verified skills.`}>
            {d.gaps.gaps.length ? (
              <ul className="divide-y divide-line text-sm">
                {d.gaps.gaps.map((g) => (
                  <li key={g.skill} className="flex items-center gap-2 py-2">
                    <span className="flex-1 font-medium">{g.skill}</span>
                    <span className="text-xs text-muted">{g.source}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">No gaps found yet. Save jobs with their descriptions to see what they ask for.</p>
            )}
          </Card>
          <Card title="Open weak areas" description="From interviews, mock interviews and scenarios.">
            {d.gaps.weaknesses.length ? (
              <ul className="space-y-2 text-sm">
                {d.gaps.weaknesses.map((w: any) => (
                  <li key={w.topic}>
                    <span className="font-medium">{w.topic}</span> <span className="text-xs text-muted">· {w.source}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">None recorded.</p>
            )}
          </Card>
        </div>
      )}
      {tab === "practice" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {SKILL_TABS.map((s) => (
              <a key={s} href={`/app/skills?tab=practice&skill=${encodeURIComponent(s)}`} className={`btn btn-sm ${s === skill ? "btn-primary" : "btn-secondary"}`}>
                {s}
              </a>
            ))}
            <span className="mx-2 border-l border-line" />
            {["beginner", "intermediate", "advanced"].map((l) => (
              <a key={l} href={`/app/skills?tab=practice&skill=${encodeURIComponent(skill)}&level=${sp.level === l ? "" : l}`} className={`btn btn-sm capitalize ${sp.level === l ? "btn-primary" : "btn-ghost"}`}>
                {l}
              </a>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {exercises.map((e) => (
              <div key={e.id} className="card p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Badge>{e.level}</Badge>
                  {doneMap.has(e.id) && <Badge tone={doneMap.get(e.id) ? "good" : "warn"}>{doneMap.get(e.id) ? "solved" : "attempted"}</Badge>}
                </div>
                <p className="text-sm font-medium">{e.prompt}</p>
                <ActionForm action={exerciseAction} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={e.id} />
                  {e.options ? (
                    e.options.map((o, i) => (
                      <label key={i} className="flex items-start gap-2 text-sm">
                        <input type="radio" name="response" value={i} required className="mt-1" /> <span>{o}</span>
                      </label>
                    ))
                  ) : (
                    <input name="response" type="number" step="any" className="input w-48" placeholder="Your answer" required aria-label="Answer" />
                  )}
                  <SubmitButton className="btn btn-secondary btn-sm">Check</SubmitButton>
                </ActionForm>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === "progress" && (
        <Card title="Completed activities by skill">
          {d.gaps.progress.length ? (
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Skill / area</th>
                  <th>Activities</th>
                  <th>Exercises correct</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {d.gaps.progress.map((p: any) => (
                  <tr key={p.skill}>
                    <td>{p.skill}</td>
                    <td className="tabular-nums">{p.done}</td>
                    <td className="tabular-nums">{p.correct}</td>
                    <td>{new Date(p.last).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-ink-2">Nothing completed yet.</p>
          )}
        </Card>
      )}
    </div>
  );
}

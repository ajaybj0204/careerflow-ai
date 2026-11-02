import Link from "next/link";
import { ROLE_GUIDES } from "@careerflow/core";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client";
import { ResultPanel } from "@/components/forms";
import { MockInterview } from "@/components/mock";
import { Badge, Card, fmtDate, PageHeader, Tabs } from "@/components/ui";
import { withUser } from "@/lib/session";
import { addInterviewAction } from "../_actions/applications";
import { answerMockAction, correctReviewAction, finishMockAction, postReviewAction, prepPlanAction, startMockAction, weaknessAction } from "../_actions/interview";

export const metadata = { title: "Interview Studio" };

export default async function Interview({ searchParams }: { searchParams: Promise<{ tab?: string; application?: string; mock?: string; review?: string; guide?: string }> }) {
  const sp = await searchParams;
  const tab = sp.mock ? "mock" : sp.review ? "review" : (sp.tab ?? "prepare");
  const d = await withUser(async (tx) => ({
    apps: await tx.query<{ id: string; company: string; role_title: string }>("select id, company, role_title from applications where not archived and status not in ('saved','rejected','withdrawn') order by last_activity_at desc limit 100"),
    upcoming: await tx.query("select i.*, a.company, a.role_title from interviews i left join applications a on a.id = i.application_id where i.status in ('requested','scheduled','rescheduled') order by i.scheduled_at nulls last"),
    weaknesses: await tx.query("select * from weaknesses order by status, updated_at desc"),
    reviews: await tx.query("select r.*, a.company from post_interview_reviews r left join applications a on a.id = r.application_id order by r.created_at desc limit 10"),
    sessions: await tx.query("select s.*, a.company, (select feedback from mock_interview_feedback f where f.session_id = s.id limit 1) as feedback from mock_interview_sessions s left join applications a on a.id = s.application_id order by s.created_at desc limit 10"),
    bank: await tx.query("select * from interview_questions where user_id is not null order by created_at desc limit 40"),
    prefs: await tx.one("select transcript_consent from user_preferences limit 1"),
    cp: await tx.one("select target_roles from career_profiles limit 1"),
  }));
  const appOpts = d.apps.map((a) => ({ id: a.id, label: `${a.company} · ${a.role_title}` }));
  const guide = ROLE_GUIDES.find((g) => g.slug === sp.guide) ?? null;
  return (
    <div className="space-y-6">
      <PageHeader title="Interview Intelligence Studio" description="Prepare from the real job description and your submitted resume, practise with follow-up questions, and learn from every interview you attend." />
      <Tabs
        base="/app/interview"
        active={tab}
        tabs={[
          { id: "prepare", label: "Interview Tomorrow" },
          { id: "mock", label: "Mock interviews" },
          { id: "guides", label: "Role guides" },
          { id: "review", label: "Post-interview review" },
          { id: "weak", label: "Weakness tracker", count: d.weaknesses.filter((w: any) => w.status !== "resolved").length },
          { id: "bank", label: "Question bank", count: d.bank.length },
        ]}
      />

      {tab === "prepare" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Interview Tomorrow mode" description="A focused plan for the time you have." className="lg:col-span-2">
            <ResultPanel action={prepPlanAction} kind="prep" submitLabel="Build my plan" pendingText="Planning…">
              <div className="grid gap-3 sm:grid-cols-3">
                <select name="applicationId" className="input" defaultValue={sp.application ?? ""} aria-label="Application">
                  <option value="">No specific application</option>
                  {appOpts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <select name="minutes" className="input" defaultValue="60" aria-label="Time available">
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">60 minutes</option>
                  <option value="120">120 minutes</option>
                </select>
                <select name="stage" className="input" aria-label="Stage">
                  <option value="">Stage (optional)</option>
                  <option>HR screening</option>
                  <option>Technical</option>
                  <option>Managerial</option>
                  <option>Final / HR</option>
                </select>
              </div>
              <input name="role" className="input" placeholder={`Target role (default: ${d.cp?.target_roles?.[0] ?? "from application"})`} />
            </ResultPanel>
          </Card>
          <Card title="Upcoming interviews">
            {d.upcoming.length ? (
              <ul className="space-y-2 text-sm">
                {d.upcoming.map((i: any) => (
                  <li key={i.id} className="rounded-lg bg-surface-2 p-2.5">
                    <p className="font-medium">{i.company ?? "Interview"}</p>
                    <p className="text-ink-2">
                      {i.round_type} · {i.scheduled_at ? fmtDate(i.scheduled_at, true) : "time not set"}
                    </p>
                    {i.application_id && (
                      <Link href={`/app/applications/${i.application_id}?tab=prep`} className="link text-xs">
                        Open workspace
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">No upcoming interviews.</p>
            )}
            <details className="mt-3">
              <summary className="btn btn-secondary btn-sm cursor-pointer">Add interview</summary>
              <ActionForm action={addInterviewAction} resetOnSuccess className="mt-2 grid gap-2">
                <select name="applicationId" className="input" aria-label="Application">
                  <option value="">No application</option>
                  {appOpts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <select name="roundType" className="input" aria-label="Round">
                  {["hr", "technical", "managerial", "behavioral", "case", "panel", "final", "other"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <input name="scheduledAt" type="datetime-local" className="input" aria-label="When" />
                <input name="link" className="input" placeholder="Link or venue" />
                <SubmitButton className="btn btn-primary btn-sm">Add</SubmitButton>
              </ActionForm>
            </details>
          </Card>
        </div>
      )}

      {tab === "mock" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Mock interview" description="Text or voice answers. Follow-up questions adapt when AI is configured; otherwise questions come from the role guides and your past interviews." className="lg:col-span-2">
            <MockInterview start={startMockAction} answer={answerMockAction} finish={finishMockAction} apps={appOpts} defaultApp={sp.application} defaultType={sp.mock} transcriptDefault={!!d.prefs?.transcript_consent} />
          </Card>
          <Card title="Past sessions">
            {d.sessions.length ? (
              <ul className="space-y-2 text-sm">
                {d.sessions.map((s: any) => (
                  <li key={s.id}>
                    <span className="font-medium capitalize">{s.interview_type}</span>
                    {s.company && <span className="text-ink-2"> · {s.company}</span>}
                    <span className="block text-xs text-muted">
                      {fmtDate(s.created_at, true)} · {s.status}
                      {s.transcript_saved ? " · transcript saved" : ""}
                    </span>
                    {s.feedback?.summary && <p className="text-xs text-ink-2">{s.feedback.summary}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">No sessions yet.</p>
            )}
          </Card>
        </div>
      )}

      {tab === "guides" && (
        <div className="grid gap-6 lg:grid-cols-4">
          <Card title="Roles">
            <ul className="space-y-1">
              {ROLE_GUIDES.map((g) => (
                <li key={g.slug}>
                  <Link href={`/app/interview?tab=guides&guide=${g.slug}`} className={`block rounded-lg px-2 py-1.5 text-sm ${guide?.slug === g.slug ? "bg-accent-soft text-accent" : "hover:bg-surface-2"}`}>
                    {g.role}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <div className="space-y-6 lg:col-span-3">
            {guide ? (
              <>
                <Card title={guide.role}>
                  <div className="grid gap-5 text-sm md:grid-cols-2">
                    <div>
                      <p className="font-medium">Fundamentals</p>
                      <ul className="mt-1 list-disc pl-5 text-ink-2">
                        {guide.fundamentals.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium">Advanced</p>
                      <ul className="mt-1 list-disc pl-5 text-ink-2">
                        {guide.advanced.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium">Practical exercises</p>
                      <ul className="mt-1 list-disc pl-5 text-ink-2">
                        {guide.exercises.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium">Real-world example</p>
                      <p className="mt-1 text-ink-2">{guide.example}</p>
                    </div>
                  </div>
                </Card>
                <Card title="Interview questions">
                  <ul className="space-y-3 text-sm">
                    {guide.questions.map((q) => (
                      <li key={q.q}>
                        <p className="font-medium">
                          {q.q} <Badge>{q.category}</Badge>
                        </p>
                        <p className="text-ink-2">{q.guidance}</p>
                      </li>
                    ))}
                  </ul>
                  <Link href={`/app/interview?mock=${guide.slug === "hr-round" ? "hr" : "technical"}`} className="btn btn-primary btn-sm mt-4">
                    Practise these in a mock interview
                  </Link>
                </Card>
              </>
            ) : (
              <Card title="Choose a role">
                <p className="text-sm text-ink-2">Guides cover fundamentals, advanced topics, exercises, examples and common questions. Examples are hypothetical and never treated as your experience.</p>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "review" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card id="review" title="Record what happened" description="Your notes update the weakness tracker, the question bank and future preparation." className="lg:col-span-2">
            <ActionForm action={postReviewAction} resetOnSuccess className="grid gap-3">
              <input type="hidden" name="interviewId" value={sp.review ?? ""} />
              <select name="applicationId" className="input" defaultValue={sp.application ?? ""} aria-label="Application">
                <option value="">No specific application</option>
                {appOpts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
              <textarea name="questions" rows={5} className="input" placeholder="Questions you were asked, one per line" />
              <input name="difficultTopics" className="input" placeholder="Difficult topics (comma separated)" />
              <textarea name="answersGiven" rows={3} className="input" placeholder="How you answered (optional)" />
              <textarea name="struggledWith" rows={2} className="input" placeholder="Where you struggled" />
              <textarea name="recruiterFeedback" rows={2} className="input" placeholder="Feedback from the recruiter/interviewer" />
              <textarea name="observations" rows={2} className="input" placeholder="Your observations" />
              <input name="nextSteps" className="input" placeholder="Next steps" />
              <SubmitButton>Save and analyse</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Past reviews">
            {d.reviews.length ? (
              <ul className="space-y-4 text-sm">
                {d.reviews.map((r: any) => (
                  <li key={r.id}>
                    <p className="font-medium">
                      {r.company ?? "Interview"} · {fmtDate(r.created_at)}
                    </p>
                    <p className="text-ink-2">{r.analysis?.summary}</p>
                    {r.analysis?.weakTopics?.length > 0 && <p className="text-xs">Weak topics: {r.analysis.weakTopics.map((w: any) => w.topic).join(", ")}</p>}
                    {r.user_corrections ? (
                      <p className="text-xs text-muted">Your correction: {r.user_corrections}</p>
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-xs text-accent">Correct this analysis</summary>
                        <ActionForm action={correctReviewAction} className="mt-2 space-y-2">
                          <input type="hidden" name="id" value={r.id} />
                          <textarea name="corrections" rows={2} className="input" placeholder="What did the analysis get wrong?" />
                          <input name="removeTopics" className="input" placeholder="Topics to remove from weaknesses" />
                          <SubmitButton className="btn btn-secondary btn-sm">Save</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">No reviews yet.</p>
            )}
          </Card>
        </div>
      )}

      {tab === "weak" && (
        <Card title="Weakness tracker" description="Built from mock interviews, scenarios and your real interviews. Update the status as you improve.">
          <ul className="divide-y divide-line">
            {d.weaknesses.map((w: any) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <span className="flex-1">
                  <span className="font-medium">{w.topic}</span>
                  <span className="block text-xs text-muted">
                    {w.source.replace("_", " ")} · {w.evidence}
                  </span>
                </span>
                <Badge tone={w.status === "resolved" ? "good" : w.status === "improving" ? "info" : "warn"}>{w.status}</Badge>
                {["open", "improving", "resolved"]
                  .filter((s) => s !== w.status)
                  .map((s) => (
                    <ActionButton key={s} action={weaknessAction} fields={{ op: s, id: w.id }} className="btn btn-ghost btn-sm">
                      {s}
                    </ActionButton>
                  ))}
              </li>
            ))}
          </ul>
          <ActionForm action={weaknessAction} resetOnSuccess className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="op" value="add" />
            <input name="topic" className="input flex-1" placeholder="Add a topic you want to improve" required />
            <SubmitButton className="btn btn-secondary">Add</SubmitButton>
          </ActionForm>
        </Card>
      )}

      {tab === "bank" && (
        <Card title="Your question bank" description="Questions from your real interviews, reused in mock interviews and preparation plans.">
          {d.bank.length ? (
            <ul className="divide-y divide-line text-sm">
              {d.bank.map((q: any) => (
                <li key={q.id} className="py-2">
                  {q.question} <span className="text-xs text-muted">· {q.role}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">Questions you record after interviews appear here.</p>
          )}
        </Card>
      )}
    </div>
  );
}

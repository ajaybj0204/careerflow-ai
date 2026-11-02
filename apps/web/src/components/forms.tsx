"use client";

/**
 * Client components that render server-action results (render props cannot cross the server/client boundary).
 */
import { useState } from "react";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { ActionForm, CopyButton, DictationTextarea, SubmitButton } from "./client";

type Action = (prev: any, f: FormData) => Promise<any>;

export function ExtensionTokenForm({ action }: { action: Action }) {
  return (
    <ActionForm
      action={action}
      successToast={false}
      render={(s) =>
        s.ok && s.data?.token ? (
          <div className="mt-3 rounded-lg bg-warn-soft p-3 text-sm">
            <p className="font-medium text-warn">Copy this token now — it will not be shown again.</p>
            <code className="mt-1 block break-all">{s.data.token}</code>
            <div className="mt-2">
              <CopyButton text={s.data.token} />
            </div>
          </div>
        ) : null
      }
    >
      <SubmitButton className="btn btn-secondary btn-sm">Create new token</SubmitButton>
    </ActionForm>
  );
}

const TONES = ["professional", "formal", "confident", "concise"];

export function CopilotForm({ action, saveAction, apps, defaultApp, defaultQuestion }: { action: Action; saveAction: Action; apps: { id: string; label: string }[]; defaultApp?: string; defaultQuestion?: string }) {
  const [last, setLast] = useState<any>(null);
  return (
    <div className="space-y-4">
      <ActionForm action={action} successToast={false} onResult={(s) => s.ok && setLast(s.data)} className="space-y-3">
        <div>
          <label className="label" htmlFor="question">
            Question
          </label>
          <DictationTextarea id="question" name="question" rows={3} className="input" defaultValue={defaultQuestion} placeholder="e.g. Why are you interested in this role?" required voice />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <select name="applicationId" className="input" defaultValue={defaultApp ?? ""} aria-label="Application">
            <option value="">No specific application</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <select name="tone" className="input capitalize" aria-label="Tone">
            {TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select name="length" className="input" aria-label="Length">
            <option value="detailed">Detailed</option>
            <option value="short">Short</option>
          </select>
          <input name="charLimit" type="number" min="50" max="5000" className="input" placeholder="Character limit" aria-label="Character limit" />
        </div>
        <input name="instruction" className="input" placeholder="Optional instruction, e.g. mention my reconciliation project" aria-label="Instruction" />
        <SubmitButton pendingText="Writing…">Generate answer</SubmitButton>
      </ActionForm>
      {last && <AnswerCard data={last} action={action} saveAction={saveAction} />}
    </div>
  );
}

function AnswerCard({ data, action, saveAction }: { data: any; action: Action; saveAction: Action }) {
  const [text, setText] = useState<string>(data.answer);
  const [cur, setCur] = useState<any>(data);
  const regen = (instruction: string, extra: Record<string, string> = {}) => (
    <ActionForm action={action} successToast={false} onResult={(s) => s.ok && (setCur(s.data), setText(s.data.answer))} className="inline">
      <input type="hidden" name="question" value={cur.question} />
      <input type="hidden" name="instruction" value={instruction} />
      {Object.entries(extra).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton className="btn btn-ghost btn-sm">{instruction ? instruction.split(":")[0] : "Regenerate"}</SubmitButton>
    </ActionForm>
  );
  return (
    <div className="card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        {cur.method === "profile" ? "Answered from your career profile" : "AI draft grounded in your verified profile"} · {text.length} characters
      </div>
      {text ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="input" aria-label="Answer" />
      ) : (
        <p className="text-sm text-ink-2">No answer could be written from your verified profile.</p>
      )}
      {cur.missingFacts?.length > 0 && (
        <div className="mt-2 rounded-lg bg-warn-soft p-2.5 text-sm text-warn">
          Missing from your profile (not invented): {cur.missingFacts.join("; ")}
        </div>
      )}
      {cur.issues?.length > 0 && (
        <ul className="mt-2 space-y-1">
          {cur.issues.map((i: any, k: number) => (
            <li key={k} className="flex gap-1.5 text-xs text-bad">
              <ShieldAlert className="size-3.5 shrink-0" /> {i.detail} — please check before using.
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1">
        <CopyButton text={text} />
        {cur.method !== "profile" && (
          <>
            {regen("")}
            {regen("Simplify: use plainer, shorter sentences")}
            {regen("More confident tone", { tone: "confident" })}
            {regen("More formal tone", { tone: "formal" })}
          </>
        )}
        <ActionForm action={saveAction} className="inline">
          <input type="hidden" name="question" value={cur.question} />
          <input type="hidden" name="answer" value={text} />
          <SubmitButton className="btn btn-primary btn-sm">Save to library</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}

export function ScreenshotQuestions({ action }: { action: Action }) {
  const [qs, setQs] = useState<{ question: string; charLimit: number | null }[]>([]);
  return (
    <div>
      <ActionForm action={action} onResult={(s) => s.ok && setQs(s.data.questions)} className="flex flex-wrap items-center gap-2">
        <input type="file" name="image" accept="image/png,image/jpeg,image/webp" required className="input max-w-xs" aria-label="Screenshot" />
        <SubmitButton className="btn btn-secondary" pendingText="Reading screenshot…">
          Extract questions
        </SubmitButton>
      </ActionForm>
      {qs.length > 0 && (
        <ul className="mt-3 space-y-2">
          {qs.map((q, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="flex-1">
                {q.question}
                {q.charLimit ? <span className="text-xs text-muted"> (limit {q.charLimit})</span> : null}
              </span>
              <a className="btn btn-secondary btn-sm" href={`/app/copilot?q=${encodeURIComponent(q.question)}`}>
                Answer
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ResultPanel({ action, children, submitLabel, pendingText, kind }: { action: Action; children: React.ReactNode; submitLabel: string; pendingText?: string; kind: "prep" | "scam" | "takehome" | "linkedin" | "scenario" | "outreach" }) {
  const [data, setData] = useState<any>(null);
  return (
    <div className="space-y-4">
      <ActionForm action={action} successToast={kind === "outreach"} onResult={(s) => s.ok && setData(s.data)} className="space-y-3">
        {children}
        <SubmitButton pendingText={pendingText}>{submitLabel}</SubmitButton>
      </ActionForm>
      {data && <Result kind={kind} data={data} />}
    </div>
  );
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function Result({ kind, data }: { kind: string; data: any }) {
  if (kind === "prep") {
    const p = data.plan;
    return (
      <div className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">
            {data.minutes}-minute plan{p.role ? ` · ${p.role}` : ""}
          </p>
          <span className="text-xs text-muted">{p.method === "ai" ? "AI-personalised" : "Rule-based"}</span>
          <a className="btn btn-secondary btn-sm ml-auto" href={`/api/interview/revision-pdf?minutes=${data.minutes}${data.applicationId ? `&application=${data.applicationId}` : ""}`}>
            Download revision PDF
          </a>
        </div>
        {p.blocks.map((b: any, i: number) => (
          <div key={i}>
            <p className="text-sm font-medium">
              {b.title} <span className="text-muted">· {b.minutes} min</span>
            </p>
            <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">
              {b.activities.map((a: string, k: number) => (
                <li key={k}>{a}</li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <p className="text-sm font-medium">Likely questions</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">
            {p.likelyQuestions.map((q: string, i: number) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
        {p.keyPointsFromResume.length > 0 && (
          <div>
            <p className="text-sm font-medium">From your resume</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">
              {p.keyPointsFromResume.map((q: string, i: number) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
  if (kind === "scam") {
    const tone = data.risk === "high" ? "bg-bad-soft text-bad" : data.risk === "medium" ? "bg-warn-soft text-warn" : "bg-good-soft text-good";
    return (
      <div className="card space-y-3 p-4">
        <p className={`inline-block rounded-full px-3 py-1 text-sm font-semibold capitalize ${tone}`}>{data.risk} risk</p>
        <p className="text-sm text-ink-2">{data.disclaimer}</p>
        {data.signals.map((s: any) => (
          <div key={s.id} className="rounded-lg border border-line p-3 text-sm">
            <p className="font-medium">
              {s.title} <span className="text-xs text-muted capitalize">· {s.severity}</span>
            </p>
            <p className="text-ink-2">{s.evidence}</p>
            <p className="mt-1 text-xs">{s.advice}</p>
          </div>
        ))}
        <div>
          <p className="text-sm font-medium">How to verify</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">
            {data.checks.map((c: string, i: number) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  if (kind === "takehome") {
    return (
      <div className="card space-y-3 p-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted">Approx. monthly in-hand</p>
            <p className="text-2xl font-semibold">{inr(data.monthlyNet)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Annual net</p>
            <p className="text-lg font-semibold">{inr(data.annualNet)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Income tax (incl. cess)</p>
            <p className="text-lg font-semibold">{inr(data.tax.total)}</p>
          </div>
        </div>
        <table className="table w-full">
          <tbody>
            <tr>
              <td>Gross taxable salary</td>
              <td className="text-right tabular-nums">{inr(data.annualGross)}</td>
            </tr>
            <tr>
              <td>Employer PF (inside CTC)</td>
              <td className="text-right tabular-nums">{inr(data.employerPf)}</td>
            </tr>
            <tr>
              <td>Gratuity (inside CTC)</td>
              <td className="text-right tabular-nums">{inr(data.gratuity)}</td>
            </tr>
            <tr>
              <td>Employee PF</td>
              <td className="text-right tabular-nums">−{inr(data.employeePf)}</td>
            </tr>
            <tr>
              <td>Professional tax</td>
              <td className="text-right tabular-nums">−{inr(data.professionalTax)}</td>
            </tr>
            <tr>
              <td>Income tax (taxable {inr(data.tax.taxable)}, rebate {inr(data.tax.rebate)})</td>
              <td className="text-right tabular-nums">−{inr(data.tax.total)}</td>
            </tr>
          </tbody>
        </table>
        <div>
          <p className="font-medium">Assumptions</p>
          <ul className="mt-1 list-disc pl-5 text-ink-2">
            {data.assumptions.map((a: string, i: number) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  if (kind === "linkedin") {
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted">{data.method === "ai" ? "AI suggestions from your verified profile" : "Template built from your verified profile (connect AI for richer suggestions)"}. Nothing is changed on LinkedIn — copy what you like.</p>
        <Block title="Headline" text={data.headline} />
        <Block title="About" text={data.about} />
        {data.experienceRewrites?.map((e: any, i: number) => <Block key={i} title={`Experience · ${e.company}`} text={e.text} />)}
        {data.skillsToFeature?.length > 0 && <Block title="Skills to feature" text={data.skillsToFeature.join(", ")} />}
        {data.projectBlurbs?.map((p: any, i: number) => <Block key={i} title={`Project · ${p.project}`} text={p.text} />)}
      </div>
    );
  }
  if (kind === "scenario") {
    const f = data.feedback;
    return (
      <div className="card space-y-3 p-4 text-sm">
        <p className="font-semibold">
          Covered about {Math.round(data.coverage * 100)}% of the model approach <span className="text-xs font-normal text-muted">({data.method === "ai" ? "AI feedback" : "keyword check"})</span>
        </p>
        <p className="text-ink-2">{f.structureNotes}</p>
        {f.strengths.length > 0 && (
          <div>
            <p className="font-medium text-good">Strengths</p>
            <ul className="list-disc pl-5 text-ink-2">
              {f.strengths.map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {f.gaps.length > 0 && (
          <div>
            <p className="font-medium text-warn">Gaps</p>
            <ul className="list-disc pl-5 text-ink-2">
              {f.gaps.map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p className="font-medium">Model approach</p>
          <ol className="list-decimal pl-5 text-ink-2">
            {f.improvedApproach.map((s: string, i: number) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-muted">This is a hypothetical practice scenario. It is not added to your profile as experience.</p>
      </div>
    );
  }
  if (kind === "outreach") {
    return <OutreachResult data={data} />;
  }
  return null;
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div className="card p-4">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <CopyButton text={text} />
      </div>
      <p className="text-sm whitespace-pre-line text-ink-2">{text}</p>
    </div>
  );
}

function OutreachResult({ data }: { data: any }) {
  const [subject, setSubject] = useState<string>(data.subject ?? "");
  const [body, setBody] = useState<string>(data.body);
  const compose = (() => {
    const p = new URLSearchParams({ view: "cm", fs: "1", body });
    if (data.to) p.set("to", data.to);
    if (subject) p.set("su", subject);
    return `https://mail.google.com/mail/?${p}`;
  })();
  return (
    <div className="card space-y-3 p-4">
      <p className="text-xs text-muted">{data.method === "ai" ? "AI draft" : "Template"} from your application details. CareerFlow never sends messages for you.</p>
      {data.subject !== null && <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" aria-label="Subject" />}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="input" aria-label="Message" />
      <div className="flex flex-wrap gap-2">
        <CopyButton text={subject ? `Subject: ${subject}\n\n${body}` : body} label="Copy message" />
        <a href={compose} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
          Open in Gmail to send <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

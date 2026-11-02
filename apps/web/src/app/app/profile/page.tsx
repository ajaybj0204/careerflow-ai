import { CheckCircle2, CircleAlert } from "lucide-react";
import { FACT_SOURCE_LABEL } from "@careerflow/shared";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client";
import { Badge, Card, Field, fmtDate, Notice, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { addFact, removeFact, saveProfile, setProjectStatus, verifyAllExtracted, verifyFact } from "../_actions/profile";

export const metadata = { title: "My Career Profile" };

function FactControls({ table, row }: { table: string; row: any }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {row.verified ? (
        <Badge tone="good" title={FACT_SOURCE_LABEL[row.source as keyof typeof FACT_SOURCE_LABEL]}>
          <CheckCircle2 className="size-3" /> Verified
        </Badge>
      ) : (
        <Badge tone="warn" title={FACT_SOURCE_LABEL[row.source as keyof typeof FACT_SOURCE_LABEL]}>
          <CircleAlert className="size-3" /> {FACT_SOURCE_LABEL[row.source as keyof typeof FACT_SOURCE_LABEL]}
        </Badge>
      )}
      <ActionButton action={verifyFact} fields={{ table, id: row.id, verified: row.verified ? "false" : "true" }} className="btn btn-ghost btn-sm">
        {row.verified ? "Unverify" : "Confirm"}
      </ActionButton>
      <ActionButton action={removeFact} fields={{ table, id: row.id }} className="btn btn-ghost btn-sm text-bad" confirm="Remove this item from your profile?">
        Remove
      </ActionButton>
    </div>
  );
}

function SectionCard({ title, table, rows, description, children, render }: { title: string; table: string; rows: any[]; description?: string; children: React.ReactNode; render: (r: any) => React.ReactNode }) {
  const pending = rows.filter((r) => !r.verified).length;
  return (
    <Card
      id={table}
      title={
        <>
          {title} <span className="text-sm font-normal text-muted">({rows.length})</span>
        </>
      }
      description={description}
      actions={
        pending > 1 ? (
          <ActionButton action={verifyAllExtracted} fields={{ table }} confirm={`Confirm all ${pending} unverified items in ${title}? Only do this if they are all accurate.`}>
            Confirm all {pending}
          </ActionButton>
        ) : undefined
      }
    >
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 flex-1 text-sm">{render(r)}</div>
            <FactControls table={table} row={r} />
          </li>
        ))}
      </ul>
      <details className="mt-3">
        <summary className="btn btn-secondary btn-sm cursor-pointer">Add</summary>
        <ActionForm action={addFact} resetOnSuccess className="mt-3 grid gap-3 rounded-xl bg-surface-2 p-4 sm:grid-cols-2">
          <input type="hidden" name="table" value={table} />
          {children}
          <div className="sm:col-span-2">
            <SubmitButton>Add (verified by you)</SubmitButton>
          </div>
        </ActionForm>
      </details>
    </Card>
  );
}

export default async function Profile() {
  const d = await withUser(async (tx) => ({
    p: await tx.one("select * from profiles limit 1"),
    cp: await tx.one("select * from career_profiles limit 1"),
    emp: await tx.query("select * from employment_history order by is_current desc, start_date desc nulls last"),
    edu: await tx.query("select * from education order by end_year desc nulls last"),
    skills: await tx.query("select * from verified_skills order by verified desc, name"),
    certs: await tx.query("select * from certifications order by created_at desc"),
    projects: await tx.query("select * from portfolio_projects order by created_at desc"),
    ach: await tx.query("select * from verified_achievements order by created_at desc"),
  }));
  const pending = [d.emp, d.edu, d.skills, d.certs, d.projects, d.ach].reduce((s, rows) => s + rows.filter((r: any) => !r.verified).length, 0);
  const cp = d.cp ?? {};
  return (
    <div className="space-y-6">
      <PageHeader title="My Career Profile" description="Your verified career knowledge base. Every AI feature uses only items marked Verified. Facts extracted from documents wait here for your confirmation." />
      {pending > 0 && (
        <Notice tone="warn" title={`${pending} item(s) need your review`}>
          These were extracted from your documents or suggested. Confirm only what is accurate; edit or remove anything that is wrong. Unconfirmed items are never used by AI.
        </Notice>
      )}

      <Card title="Profile and preferences">
        <ActionForm action={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="fullName">
            <input id="fullName" name="fullName" className="input" defaultValue={d.p?.full_name ?? ""} />
          </Field>
          <Field label="Career stage" htmlFor="userType">
            <select id="userType" name="userType" className="input" defaultValue={d.p?.user_type ?? "experienced"}>
              <option value="fresher">Fresher / student</option>
              <option value="experienced">Experienced professional</option>
              <option value="switcher">Career switcher</option>
            </select>
          </Field>
          <Field label="Headline" htmlFor="headline">
            <input id="headline" name="headline" className="input" defaultValue={cp.headline ?? ""} placeholder="Payments Operations | Merchant onboarding | SQL & Excel" />
          </Field>
          <Field label="Location" htmlFor="location">
            <input id="location" name="location" className="input" defaultValue={cp.location ?? ""} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Professional summary" htmlFor="summary">
              <textarea id="summary" name="summary" rows={3} className="input" defaultValue={cp.summary ?? ""} />
            </Field>
          </div>
          <Field label="Phone" htmlFor="phone">
            <input id="phone" name="phone" className="input" defaultValue={cp.phone ?? ""} />
          </Field>
          <Field label="Total experience (years)" htmlFor="yearsExperience">
            <input id="yearsExperience" name="yearsExperience" type="number" step="0.5" min="0" className="input" defaultValue={cp.years_experience ?? ""} />
          </Field>
          <Field label="Current / last CTC (LPA)" htmlFor="currentCtcLpa">
            <input id="currentCtcLpa" name="currentCtcLpa" type="number" step="0.01" min="0" className="input" defaultValue={cp.current_ctc_lpa ?? ""} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expected CTC from" htmlFor="expectedCtcMinLpa">
              <input id="expectedCtcMinLpa" name="expectedCtcMinLpa" type="number" step="0.01" min="0" className="input" defaultValue={cp.expected_ctc_min_lpa ?? ""} />
            </Field>
            <Field label="to (LPA)" htmlFor="expectedCtcMaxLpa">
              <input id="expectedCtcMaxLpa" name="expectedCtcMaxLpa" type="number" step="0.01" min="0" className="input" defaultValue={cp.expected_ctc_max_lpa ?? ""} />
            </Field>
          </div>
          <Field label="Notice period (days)" htmlFor="noticePeriodDays">
            <input id="noticePeriodDays" name="noticePeriodDays" type="number" min="0" className="input" defaultValue={cp.notice_period_days ?? ""} />
          </Field>
          <fieldset>
            <legend className="label">Work modes</legend>
            <div className="flex gap-4 pt-1.5 text-sm">
              {["onsite", "hybrid", "remote"].map((m) => (
                <label key={m} className="flex items-center gap-1.5 capitalize">
                  <input type="checkbox" name="workModes" value={m} defaultChecked={(cp.work_modes ?? []).includes(m)} /> {m}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Target roles (comma separated)" htmlFor="targetRoles">
            <input id="targetRoles" name="targetRoles" className="input" defaultValue={(cp.target_roles ?? []).join(", ")} />
          </Field>
          <Field label="Roles to avoid" htmlFor="avoidRoles">
            <input id="avoidRoles" name="avoidRoles" className="input" defaultValue={(cp.avoid_roles ?? []).join(", ")} />
          </Field>
          <Field label="Preferred locations" htmlFor="preferredLocations">
            <input id="preferredLocations" name="preferredLocations" className="input" defaultValue={(cp.preferred_locations ?? []).join(", ")} />
          </Field>
          <Field label="LinkedIn URL" htmlFor="linkedinUrl">
            <input id="linkedinUrl" name="linkedinUrl" className="input" defaultValue={cp.linkedin_url ?? ""} />
          </Field>
          <Field label="GitHub URL" htmlFor="githubUrl">
            <input id="githubUrl" name="githubUrl" className="input" defaultValue={cp.github_url ?? ""} />
          </Field>
          <Field label="Portfolio URL" htmlFor="portfolioUrl">
            <input id="portfolioUrl" name="portfolioUrl" className="input" defaultValue={cp.portfolio_url ?? ""} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Career goals" htmlFor="careerGoals">
              <textarea id="careerGoals" name="careerGoals" rows={2} className="input" defaultValue={cp.career_goals ?? ""} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <SubmitButton>Save profile</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <SectionCard
        title="Employment history"
        table="employment_history"
        rows={d.emp}
        render={(r) => (
          <>
            <p className="font-medium">
              {r.title} · {r.company}
            </p>
            <p className="text-xs text-muted">
              {r.start_date ? fmtDate(r.start_date).replace(/^\d+ /, "") : "?"} – {r.is_current ? "Present" : r.end_date ? fmtDate(r.end_date).replace(/^\d+ /, "") : "?"}
              {r.location ? ` · ${r.location}` : ""}
            </p>
            {r.bullets?.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-ink-2">
                {r.bullets.map((b: string, i: number) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
          </>
        )}
      >
        <input name="company" placeholder="Company *" className="input" required />
        <input name="title" placeholder="Job title *" className="input" required />
        <input name="location" placeholder="Location" className="input" />
        <div className="grid grid-cols-2 gap-2">
          <input name="start_date" type="month" className="input" aria-label="Start month" />
          <input name="end_date" type="month" className="input" aria-label="End month" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_current" /> I currently work here
        </label>
        <textarea name="bullets" rows={4} placeholder="Responsibilities and achievements, one per line" className="input sm:col-span-2" />
      </SectionCard>

      <SectionCard
        title="Skills"
        table="verified_skills"
        rows={d.skills}
        description="Tailored resumes and answers can only use skills you verify here."
        render={(r) => (
          <p>
            <span className="font-medium">{r.name}</span>
            {r.level && <span className="text-ink-2"> · {r.level}</span>}
            {r.years && <span className="text-ink-2"> · {Number(r.years)} yrs</span>}
            {r.evidence && <span className="block text-xs text-muted">{r.evidence}</span>}
          </p>
        )}
      >
        <input name="name" placeholder="Skill *" className="input" required />
        <select name="level" className="input" defaultValue="">
          <option value="">Level (optional)</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
          <option value="expert">Expert</option>
        </select>
        <input name="years" type="number" step="0.5" min="0" placeholder="Years" className="input" />
        <input name="evidence" placeholder="Where you used it (optional)" className="input" />
      </SectionCard>

      <SectionCard
        title="Projects"
        table="portfolio_projects"
        rows={d.projects}
        description="Only completed projects are used as experience. Ideas and in-progress work are never presented as finished."
        render={(r) => (
          <>
            <p className="font-medium">
              {r.name} <Badge tone={r.status === "completed" ? "good" : r.status === "idea" ? "neutral" : "warn"}>{r.status.replace("_", " ")}</Badge>
            </p>
            {r.description && <p className="text-ink-2">{r.description}</p>}
            {r.tech?.length > 0 && <p className="text-xs text-muted">{r.tech.join(" · ")}</p>}
            <div className="mt-1.5 flex gap-1">
              {["completed", "in_progress", "idea"]
                .filter((s) => s !== r.status)
                .map((s) => (
                  <ActionButton key={s} action={setProjectStatus} fields={{ id: r.id, status: s }} className="btn btn-ghost btn-sm">
                    Mark {s.replace("_", " ")}
                  </ActionButton>
                ))}
            </div>
          </>
        )}
      >
        <input name="name" placeholder="Project name *" className="input" required />
        <select name="status" className="input" defaultValue="completed">
          <option value="completed">Completed</option>
          <option value="in_progress">In progress</option>
          <option value="idea">Idea (not built)</option>
        </select>
        <input name="url" placeholder="Live URL" className="input" />
        <input name="repo_url" placeholder="Repository URL" className="input" />
        <input name="tech" placeholder="Tech used (comma separated)" className="input sm:col-span-2" />
        <textarea name="description" rows={2} placeholder="What it does and your role" className="input sm:col-span-2" />
        <textarea name="highlights" rows={2} placeholder="Results or highlights, one per line (only real ones)" className="input sm:col-span-2" />
      </SectionCard>

      <SectionCard
        title="Education"
        table="education"
        rows={d.edu}
        render={(r) => (
          <p>
            <span className="font-medium">{[r.degree, r.field].filter(Boolean).join(", ") || r.institution}</span>
            <span className="block text-ink-2">
              {r.degree ? r.institution : ""} {r.end_year ? `· ${r.end_year}` : ""} {r.grade ? `· ${r.grade}` : ""}
            </span>
          </p>
        )}
      >
        <input name="institution" placeholder="Institution *" className="input" required />
        <input name="degree" placeholder="Degree" className="input" />
        <input name="field" placeholder="Field of study" className="input" />
        <input name="end_year" type="number" placeholder="Graduation year" className="input" />
        <input name="grade" placeholder="Grade / CGPA" className="input" />
      </SectionCard>

      <SectionCard
        title="Certifications"
        table="certifications"
        rows={d.certs}
        render={(r) => (
          <p>
            <span className="font-medium">{r.name}</span>
            {r.issuer && <span className="text-ink-2"> · {r.issuer}</span>}
          </p>
        )}
      >
        <input name="name" placeholder="Certification *" className="input" required />
        <input name="issuer" placeholder="Issuer" className="input" />
        <input name="issued_on" type="date" className="input" aria-label="Issued on" />
        <input name="credential_url" placeholder="Credential URL" className="input" />
      </SectionCard>

      <SectionCard
        title="Achievements"
        table="verified_achievements"
        rows={d.ach}
        description="Measurable results you can stand behind. AI may reuse these numbers; it cannot invent new ones."
        render={(r) => (
          <p>
            {r.description}
            {r.metric && <span className="text-ink-2"> · {r.metric}</span>}
          </p>
        )}
      >
        <textarea name="description" rows={2} placeholder="Achievement *" className="input sm:col-span-2" required />
        <input name="metric" placeholder="Metric (e.g. 300+ merchants onboarded)" className="input" />
      </SectionCard>
    </div>
  );
}

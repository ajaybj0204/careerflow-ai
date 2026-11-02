import { APPLICATION_STATUSES, STATUS_LABEL } from "@careerflow/shared";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { createApplicationAction } from "../../_actions/applications";

export const metadata = { title: "Add application" };

export default async function NewApplication({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const portals = await withUser((tx) => tx.query<{ name: string }>("select name from job_sources order by name"));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add an application or saved job" description="Saving a job and applying later keeps everything in one record — it moves from Saved to Applied in the same workspace." />
      <ActionForm action={createApplicationAction} className="card grid gap-4 p-6 sm:grid-cols-2">
        <Field label="Company *" htmlFor="company">
          <input id="company" name="company" required className="input" />
        </Field>
        <Field label="Role *" htmlFor="roleTitle">
          <input id="roleTitle" name="roleTitle" required className="input" />
        </Field>
        <Field label="Status" htmlFor="status">
          <select id="status" name="status" className="input" defaultValue={sp.status ?? "saved"}>
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Applied on (if known)" htmlFor="appliedAt" hint="The time you actually submitted. Left empty if unknown.">
          <input id="appliedAt" name="appliedAt" type="datetime-local" className="input" />
        </Field>
        <Field label="Location" htmlFor="location">
          <input id="location" name="location" className="input" />
        </Field>
        <Field label="Work mode" htmlFor="workMode">
          <select id="workMode" name="workMode" className="input" defaultValue="">
            <option value="">Unknown</option>
            <option value="onsite">On-site</option>
            <option value="hybrid">Hybrid</option>
            <option value="remote">Remote</option>
          </select>
        </Field>
        <Field label="Job portal" htmlFor="jobPortal">
          <input id="jobPortal" name="jobPortal" list="portal-list" className="input" />
          <datalist id="portal-list">
            {portals.map((p) => (
              <option key={p.name} value={p.name} />
            ))}
            <option value="Company website" />
            <option value="Referral" />
          </datalist>
        </Field>
        <Field label="Job URL" htmlFor="jobUrl">
          <input id="jobUrl" name="jobUrl" type="url" className="input" placeholder="https://" />
        </Field>
        <Field label="Job ID (if shown)" htmlFor="externalJobId">
          <input id="externalJobId" name="externalJobId" className="input" />
        </Field>
        <Field label="Salary (if disclosed)" htmlFor="salaryText">
          <input id="salaryText" name="salaryText" className="input" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Job description" htmlFor="jobDescription" hint="Paste it now so resume tailoring, match reports and interview prep can use it.">
            <textarea id="jobDescription" name="jobDescription" rows={8} className="input" />
          </Field>
        </div>
        <Field label="Next action" htmlFor="nextAction">
          <input id="nextAction" name="nextAction" className="input" placeholder="e.g. Tailor resume" />
        </Field>
        <Field label="Next action due" htmlFor="nextActionDue">
          <input id="nextActionDue" name="nextActionDue" type="date" className="input" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes" htmlFor="notes">
            <textarea id="notes" name="notes" rows={2} className="input" />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" name="allowDuplicate" value="1" /> Save even if it looks like a duplicate
          </label>
          <SubmitButton>Save</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}

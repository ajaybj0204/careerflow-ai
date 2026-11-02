import { ActionForm, SubmitButton } from "@/components/client";
import { Field, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { completeOnboarding } from "../_actions/profile";

export const metadata = { title: "Welcome" };

export default async function Onboarding() {
  const data = await withUser(async (tx) => ({
    p: await tx.one("select full_name, user_type from profiles limit 1"),
    cp: await tx.one("select * from career_profiles limit 1"),
  }));
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Welcome to CareerFlow AI" description="A few details so recommendations, resumes and interview prep fit you. Everything is editable later in My Career Profile." />
      <ActionForm action={completeOnboarding} className="card space-y-5 p-6">
        <Field label="Your name" htmlFor="fullName">
          <input id="fullName" name="fullName" className="input" defaultValue={data.p?.full_name ?? ""} />
        </Field>
        <fieldset>
          <legend className="label">Where are you in your career?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["fresher", "Fresher / student", "No full-time experience yet"],
              ["experienced", "Experienced", "Growing in my field"],
              ["switcher", "Career switcher", "Moving into a new domain"],
            ].map(([v, l, d]) => (
              <label key={v} className="card flex cursor-pointer gap-2 p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                <input type="radio" name="userType" value={v} defaultChecked={(data.p?.user_type ?? "experienced") === v} className="mt-1" />
                <span>
                  <span className="block text-sm font-medium">{l}</span>
                  <span className="block text-xs text-ink-2">{d}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Target roles" hint="Comma separated, e.g. Business Operations, Payments Operations, Data Analyst" htmlFor="targetRoles">
          <input id="targetRoles" name="targetRoles" className="input" defaultValue={(data.cp?.target_roles ?? []).join(", ")} />
        </Field>
        <Field label="Roles to avoid" hint="Recommendations will skip these, e.g. Voice BPO, Customer support process" htmlFor="avoidRoles">
          <input id="avoidRoles" name="avoidRoles" className="input" defaultValue={(data.cp?.avoid_roles ?? []).join(", ")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Current location" htmlFor="location">
            <input id="location" name="location" className="input" defaultValue={data.cp?.location ?? ""} placeholder="Bengaluru, Karnataka" />
          </Field>
          <Field label="Preferred locations" htmlFor="preferredLocations">
            <input id="preferredLocations" name="preferredLocations" className="input" defaultValue={(data.cp?.preferred_locations ?? []).join(", ")} placeholder="Bengaluru, Remote" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Current/last CTC (LPA)" htmlFor="currentCtcLpa">
            <input id="currentCtcLpa" name="currentCtcLpa" type="number" step="0.01" min="0" className="input" defaultValue={data.cp?.current_ctc_lpa ?? ""} />
          </Field>
          <Field label="Expected CTC from (LPA)" htmlFor="expectedCtcMinLpa">
            <input id="expectedCtcMinLpa" name="expectedCtcMinLpa" type="number" step="0.01" min="0" className="input" defaultValue={data.cp?.expected_ctc_min_lpa ?? ""} />
          </Field>
          <Field label="Expected CTC to (LPA)" htmlFor="expectedCtcMaxLpa">
            <input id="expectedCtcMaxLpa" name="expectedCtcMaxLpa" type="number" step="0.01" min="0" className="input" defaultValue={data.cp?.expected_ctc_max_lpa ?? ""} />
          </Field>
        </div>
        <label className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm">
          <input type="checkbox" name="aiConsent" className="mt-1" defaultChecked />
          <span>
            <span className="font-medium">Allow AI processing</span>
            <span className="block text-ink-2">Verified profile details, job descriptions and (when Gmail is connected) short excerpts of job-related emails may be sent to the AI provider (Google Gemini) to generate suggestions. You can change this any time in Settings.</span>
          </span>
        </label>
        <div className="flex justify-end">
          <SubmitButton>Continue</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}

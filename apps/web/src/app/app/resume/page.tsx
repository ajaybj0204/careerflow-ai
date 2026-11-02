import Link from "next/link";
import { FileText, Star } from "lucide-react";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client";
import { Badge, Card, EmptyState, Field, fmtDate, Notice, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { approveTemplateAction, replaceTemplateAction, setPrimaryResumeAction, startTailoringAction, uploadResumeAction } from "../_actions/documents";

export const metadata = { title: "AI Resume Studio" };

export default async function ResumeStudio({ searchParams }: { searchParams: Promise<{ application?: string }> }) {
  const sp = await searchParams;
  const d = await withUser(async (tx) => ({
    resumes: await tx.query("select * from master_resumes order by is_primary desc, created_at desc"),
    apps: await tx.query("select id, company, role_title, (job_description is not null) as has_jd from applications where not archived and status not in ('rejected','withdrawn') order by last_activity_at desc limit 100"),
    drafts: await tx.query(
      "select t.id, t.status, t.updated_at, t.changes, t.validation, a.company, a.role_title, m.label from tailored_resumes t join master_resumes m on m.id = t.master_resume_id left join applications a on a.id = t.application_id order by t.updated_at desc limit 20",
    ),
  }));
  const ai = !!process.env.GEMINI_API_KEY;
  const usable = d.resumes.filter((r: any) => r.format === "docx" || r.template_status === "reconstructed_approved");
  return (
    <div className="space-y-6">
      <PageHeader title="AI Resume Studio" description="Keep one master resume. Tailor a copy for each job using only your verified experience, in your original template." />
      {!ai && (
        <Notice tone="info" title="AI suggestions are off">
          GEMINI_API_KEY is not configured, so AI rewording is unavailable. You can still upload resumes, see job match reports, and tailor resumes by editing paragraphs yourself — the template is preserved either way.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Master resumes" className="lg:col-span-3" description="Your originals are stored unchanged and never overwritten.">
          {d.resumes.length ? (
            <ul className="divide-y divide-line">
              {d.resumes.map((r: any) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="size-4 text-muted" />
                    <span className="font-medium">{r.label}</span>
                    <Badge>{r.format.toUpperCase()}</Badge>
                    {r.is_primary && (
                      <Badge tone="accent">
                        <Star className="size-3" /> Primary
                      </Badge>
                    )}
                    {r.template_status === "reconstructed_pending" && <Badge tone="warn">Template needs approval</Badge>}
                    {r.template_status === "reconstructed_approved" && <Badge tone="good">Template approved</Badge>}
                    <span className="ml-auto text-xs text-muted">{fmtDate(r.created_at)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <a href={`/api/documents/${r.document_id}`} className="btn btn-secondary btn-sm">
                      Download original
                    </a>
                    {!r.is_primary && (
                      <ActionButton action={setPrimaryResumeAction} fields={{ id: r.id }}>
                        Make primary
                      </ActionButton>
                    )}
                  </div>
                  {r.format === "pdf" && (
                    <div className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
                      <p className="text-ink-2">
                        PDFs cannot be edited while keeping their exact layout, so CareerFlow rebuilt an editable DOCX template from it. Download it, check it (and adjust fonts or spacing in Word if you want), then approve it or upload your edited version.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {r.template_document_id && (
                          <a href={`/api/documents/${r.template_document_id}`} className="btn btn-secondary btn-sm">
                            Download rebuilt template
                          </a>
                        )}
                        {r.template_status === "reconstructed_pending" && (
                          <ActionButton action={approveTemplateAction} fields={{ id: r.id }} className="btn btn-primary btn-sm">
                            Approve template
                          </ActionButton>
                        )}
                        <ActionForm action={replaceTemplateAction} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={r.id} />
                          <input type="file" name="file" accept=".docx" required className="text-xs" aria-label="Edited template" />
                          <SubmitButton className="btn btn-secondary btn-sm">Upload edited DOCX</SubmitButton>
                        </ActionForm>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No master resume yet">Upload a DOCX for the best template preservation. PDF works too.</EmptyState>
          )}
          <ActionForm action={uploadResumeAction} resetOnSuccess className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
            <Field label="Label" htmlFor="label">
              <input id="label" name="label" className="input" placeholder="e.g. Operations resume 2026" />
            </Field>
            <Field label="File (DOCX or PDF, max 10 MB)" htmlFor="file">
              <input id="file" name="file" type="file" accept=".docx,.pdf" required className="input" />
            </Field>
            <div className="flex items-end">
              <SubmitButton pendingText="Reading resume…">Upload master resume</SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <Card title="Tailor for a job" className="lg:col-span-2" description="Creates a job match report, then a draft you can edit or improve with AI.">
          {usable.length ? (
            <ActionForm action={startTailoringAction} className="space-y-3">
              <Field label="Master resume" htmlFor="masterResumeId">
                <select id="masterResumeId" name="masterResumeId" className="input">
                  {usable.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Application" htmlFor="applicationId" hint="Or leave empty and paste a job description below.">
                <select id="applicationId" name="applicationId" className="input" defaultValue={sp.application ?? ""}>
                  <option value="">— Paste a new job description —</option>
                  {d.apps.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.company} · {a.role_title}
                      {a.has_jd ? "" : " (no JD saved)"}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <input name="company" className="input" placeholder="Company (new JD)" />
                <input name="roleTitle" className="input" placeholder="Role (new JD)" />
              </div>
              <Field label="Job description" htmlFor="jobDescription">
                <textarea id="jobDescription" name="jobDescription" rows={8} className="input" placeholder="Paste the full job description" />
              </Field>
              <SubmitButton pendingText="Analysing…">Analyse and start tailoring</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm text-ink-2">Upload a DOCX master resume (or approve a PDF's rebuilt template) to start tailoring.</p>
          )}
        </Card>
      </div>

      <Card title="Tailored versions">
        {d.drafts.length ? (
          <ul className="divide-y divide-line">
            {d.drafts.map((t: any) => {
              const accepted = (t.changes ?? []).filter((c: any) => c.decision === "accepted" || c.decision === "edited").length;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="flex-1">
                    <span className="font-medium">{t.company ? `${t.company} · ${t.role_title}` : "General"}</span>
                    <span className="block text-xs text-muted">
                      From {t.label} · {accepted} change(s) · updated {fmtDate(t.updated_at)}
                    </span>
                  </span>
                  <Badge tone={t.status === "submitted" ? "good" : t.status === "final" ? "info" : "neutral"}>{t.status}</Badge>
                  <Link href={`/app/resume/tailor/${t.id}`} className="btn btn-secondary btn-sm">
                    Open
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">No tailored resumes yet.</p>
        )}
      </Card>
    </div>
  );
}

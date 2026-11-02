import Link from "next/link";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client";
import { Badge, Card, EmptyState, fmtDate, Notice, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { exportLetterAction, generateLetterAction, packageAction, saveLetterAction } from "../_actions/documents";

export const metadata = { title: "Cover Letters" };

export default async function CoverLetters({ searchParams }: { searchParams: Promise<{ application?: string }> }) {
  const sp = await searchParams;
  const d = await withUser(async (tx) => ({
    apps: await tx.query("select id, company, role_title from applications where not archived order by last_activity_at desc limit 100"),
    letters: await tx.query("select c.*, a.company, a.role_title from cover_letters c left join applications a on a.id = c.application_id order by c.updated_at desc limit 30"),
  }));
  const ai = !!process.env.GEMINI_API_KEY;
  return (
    <div className="space-y-6">
      <PageHeader title="Cover Letters" description="Personalised from the job description and your verified profile. Edit freely, then export DOCX and PDF. Writing a letter never marks a job as applied." />
      <Card title="Generate a cover letter">
        {!ai ? (
          <Notice tone="info">AI is not configured (GEMINI_API_KEY), so letters cannot be generated. You can still write one in a document and store it in the vault.</Notice>
        ) : d.apps.length ? (
          <ActionForm action={generateLetterAction} className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <label className="label" htmlFor="applicationId">
                Application
              </label>
              <select id="applicationId" name="applicationId" className="input" defaultValue={sp.application ?? ""} required>
                <option value="" disabled>
                  Choose…
                </option>
                {d.apps.map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.company} · {a.role_title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="tone">
                Tone
              </label>
              <select id="tone" name="tone" className="input w-auto">
                <option value="professional">Professional</option>
                <option value="formal">Formal</option>
                <option value="confident">Confident</option>
                <option value="concise">Concise</option>
              </select>
            </div>
            <SubmitButton pendingText="Writing…">Generate</SubmitButton>
          </ActionForm>
        ) : (
          <p className="text-sm text-ink-2">
            <Link href="/app/applications/new" className="link">
              Save an application
            </Link>{" "}
            with its job description first.
          </p>
        )}
      </Card>
      {d.letters.length ? (
        <div className="space-y-4">
          {d.letters.map((l: any) => (
            <Card
              key={l.id}
              title={l.company ? `${l.company} · ${l.role_title}` : "Cover letter"}
              description={`Updated ${fmtDate(l.updated_at, true)}`}
              actions={<Badge>{l.tone}</Badge>}
            >
              <ActionForm action={saveLetterAction} className="space-y-2">
                <input type="hidden" name="id" value={l.id} />
                <textarea name="content" rows={12} defaultValue={l.content} className="input leading-relaxed" aria-label="Letter text" />
                <div className="flex flex-wrap items-center gap-2">
                  <SubmitButton className="btn btn-secondary btn-sm">Save edits</SubmitButton>
                </div>
              </ActionForm>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                <ActionButton action={exportLetterAction} fields={{ id: l.id }} className="btn btn-primary btn-sm">
                  Create DOCX & PDF
                </ActionButton>
                {l.docx_document_id && (
                  <>
                    <a href={`/api/documents/${l.docx_document_id}`} className="btn btn-secondary btn-sm">
                      DOCX
                    </a>
                    <a href={`/api/documents/${l.pdf_document_id}`} className="btn btn-secondary btn-sm">
                      PDF
                    </a>
                    <a href={`/api/documents/${l.pdf_document_id}?inline=1`} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">
                      Preview
                    </a>
                  </>
                )}
                {l.application_id && (
                  <ActionButton action={packageAction} fields={{ applicationId: l.application_id }} className="btn btn-ghost btn-sm">
                    Build application package
                  </ActionButton>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No cover letters yet" />
      )}
    </div>
  );
}

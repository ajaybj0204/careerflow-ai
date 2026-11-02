import { Download, Eye, FolderLock, Lock } from "lucide-react";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client";
import { Badge, Card, EmptyState, Field, fmtDate, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { deleteDocumentAction, uploadDocumentAction } from "../_actions/documents";

export const metadata = { title: "Documents" };

const KINDS: Record<string, string> = {
  master_resume: "Master resume",
  tailored_resume: "Tailored resume",
  cover_letter: "Cover letter",
  job_match_report: "Job match report",
  application_package: "Application package",
  certificate: "Certificate",
  experience_letter: "Experience letter",
  relieving_letter: "Relieving letter",
  offer_letter: "Offer letter",
  project_document: "Project document",
  interview_notes: "Interview notes",
  identity: "Identity document",
  other: "Other",
};
const UPLOAD_KINDS = ["certificate", "experience_letter", "relieving_letter", "offer_letter", "project_document", "interview_notes", "identity", "other"];

function size(n: number) {
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
}

export default async function Documents({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  const docs = await withUser((tx) =>
    tx.query(
      `select d.*, a.company, (select count(*)::int from documents c where c.parent_document_id = d.id) as newer
       from documents d left join applications a on a.id = d.application_id
       where ($1::text is null or d.kind = $1) order by d.created_at desc`,
      [sp.kind && KINDS[sp.kind] ? sp.kind : null],
    ),
  );
  return (
    <div className="space-y-6">
      <PageHeader title="Career Document Vault" description="Private storage for your resumes, letters, certificates and notes. Files are only accessible to you." />
      <Card title="Upload a document">
        <ActionForm action={uploadDocumentAction} resetOnSuccess className="grid gap-3 sm:grid-cols-4">
          <Field label="Type" htmlFor="kind">
            <select id="kind" name="kind" className="input">
              {UPLOAD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KINDS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title" htmlFor="title">
            <input id="title" name="title" className="input" placeholder="Optional" />
          </Field>
          <Field label="File (PDF, DOCX, PNG, JPG, TXT · max 10 MB)" htmlFor="file">
            <input id="file" name="file" type="file" required accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.txt" className="input" />
          </Field>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-1.5 pb-2 text-sm">
              <input type="checkbox" name="sensitive" /> Sensitive
            </label>
            <SubmitButton>Upload</SubmitButton>
          </div>
        </ActionForm>
        <p className="mt-3 text-xs text-muted">Identity documents are optional and always marked sensitive. Do not upload Aadhaar or PAN unless you need them for a specific onboarding step.</p>
      </Card>
      <div className="flex flex-wrap gap-1.5">
        <a href="/app/documents" className={`btn btn-sm ${!sp.kind ? "btn-primary" : "btn-secondary"}`}>
          All
        </a>
        {Object.entries(KINDS).map(([k, v]) => (
          <a key={k} href={`/app/documents?kind=${k}`} className={`btn btn-sm ${sp.kind === k ? "btn-primary" : "btn-secondary"}`}>
            {v}
          </a>
        ))}
      </div>
      {docs.length ? (
        <div className="card overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Version</th>
                <th>Size</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map((d: any) => (
                <tr key={d.id}>
                  <td>
                    <span className="font-medium">{d.title}</span>
                    {d.sensitive && (
                      <span className="ml-1.5 inline-flex align-middle" title="Sensitive">
                        <Lock className="size-3.5 text-warn" />
                      </span>
                    )}
                    {d.company && <span className="block text-xs text-muted">{d.company}</span>}
                  </td>
                  <td>
                    <Badge>{KINDS[d.kind] ?? d.kind}</Badge>
                  </td>
                  <td className="tabular-nums">
                    v{d.version}
                    {d.newer > 0 && <span className="block text-xs text-muted">newer version exists</span>}
                  </td>
                  <td className="tabular-nums">{size(Number(d.size_bytes))}</td>
                  <td>{fmtDate(d.created_at)}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      {/^(application\/pdf|image\/|text\/plain)/.test(d.mime_type) && (
                        <a href={`/api/documents/${d.id}?inline=1`} target="_blank" rel="noopener" className="btn btn-ghost btn-sm" aria-label="Preview">
                          <Eye className="size-3.5" />
                        </a>
                      )}
                      <a href={`/api/documents/${d.id}`} className="btn btn-ghost btn-sm" aria-label="Download">
                        <Download className="size-3.5" />
                      </a>
                      <details className="relative">
                        <summary className="btn btn-ghost btn-sm list-none">Replace</summary>
                        <ActionForm action={uploadDocumentAction} className="card absolute right-0 z-10 mt-1 w-72 space-y-2 p-3">
                          <input type="hidden" name="parentId" value={d.id} />
                          <input type="hidden" name="kind" value={d.kind} />
                          <input type="hidden" name="title" value={d.title} />
                          <input name="file" type="file" required className="input" />
                          <SubmitButton className="btn btn-primary btn-sm">Upload new version</SubmitButton>
                        </ActionForm>
                      </details>
                      <ActionButton action={deleteDocumentAction} fields={{ id: d.id }} className="btn btn-ghost btn-sm text-bad" confirm="Delete this document permanently?">
                        Delete
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<FolderLock className="size-6" />} title="No documents yet">
          Generated resumes, cover letters and packages also appear here automatically.
        </EmptyState>
      )}
    </div>
  );
}

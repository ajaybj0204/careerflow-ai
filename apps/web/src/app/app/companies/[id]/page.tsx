import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client";
import { Card, fmtDate, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { withUser } from "@/lib/session";
import { companyNotesAction, researchAction } from "../../_actions/misc";

export const metadata = { title: "Company" };

export default async function Company({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await withUser(async (tx) => {
    const c = await tx.one("select * from companies where id = $1", [id]);
    if (!c) return null;
    return { c, apps: await tx.query("select id, role_title, status from applications where lower(company) = lower($1)", [c.name]) };
  });
  if (!d) notFound();
  const { c } = d;
  const sources = c.sources?.list ?? [];
  const news = c.sources?.news ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title={c.name}
        description={c.industry ?? undefined}
        actions={
          <>
            {c.website && (
              <a href={c.website} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                Website <ExternalLink className="size-3.5" />
              </a>
            )}
            <ActionButton action={researchAction} fields={{ name: c.name, website: c.website ?? "" }} className="btn btn-secondary" pendingText="Refreshing…">
              Refresh research
            </ActionButton>
          </>
        }
      />
      {!sources.length && <Notice tone="warn">No public source was found for this name. Add the website and notes yourself, or check the spelling.</Notice>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Overview" description={`Retrieved ${fmtDate(c.researched_at, true)}`}>
            <p className="text-sm whitespace-pre-line text-ink-2">{c.summary ?? "No summary available."}</p>
            {c.products && (
              <>
                <p className="mt-3 text-sm font-medium">Products and services</p>
                <p className="text-sm text-ink-2">{c.products}</p>
              </>
            )}
          </Card>
          {c.interview_topics?.length > 0 && (
            <Card title="Topics to prepare">
              <ul className="list-disc pl-5 text-sm text-ink-2">
                {c.interview_topics.map((t: string) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Recent news" description="Only articles returned with a source link and date are shown.">
            {news.length ? (
              <ul className="space-y-2 text-sm">
                {news.map((n: any, i: number) => (
                  <li key={i}>
                    <a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                      {n.title}
                    </a>
                    {n.date && <span className="text-xs text-muted"> · {n.date}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">No verified recent news{process.env.GEMINI_API_KEY ? "" : " (needs AI with search grounding)"}.</p>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Your applications here">
            {d.apps.length ? (
              <ul className="space-y-2 text-sm">
                {d.apps.map((a: any) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <Link href={`/app/applications/${a.id}`} className="flex-1 hover:text-accent">
                      {a.role_title}
                    </Link>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">None.</p>
            )}
          </Card>
          <Card title="Sources">
            <ul className="space-y-2 text-sm">
              {sources.map((s: any, i: number) => (
                <li key={i}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="link break-all">
                    {s.title}
                  </a>
                  <span className="block text-xs text-muted">
                    {s.kind} · retrieved {fmtDate(s.retrievedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Your notes">
            <ActionForm action={companyNotesAction} className="space-y-2">
              <input type="hidden" name="id" value={c.id} />
              <input name="website" defaultValue={c.website ?? ""} className="input" placeholder="Website" />
              <textarea name="notes" defaultValue={c.notes ?? ""} rows={5} className="input" aria-label="Notes" />
              <SubmitButton className="btn btn-secondary btn-sm">Save</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </div>
  );
}

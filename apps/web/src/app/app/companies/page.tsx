import Link from "next/link";
import { Building2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/client";
import { Card, EmptyState, fmtDate, Lettermark, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { researchAction } from "../_actions/misc";

export const metadata = { title: "Company Research" };

export default async function Companies() {
  const d = await withUser(async (tx) => ({
    companies: await tx.query("select * from companies order by researched_at desc nulls last, created_at desc"),
    suggestions: await tx.query("select distinct company from applications where not archived and lower(company) not in (select lower(name) from companies) limit 8"),
  }));
  return (
    <div className="space-y-6">
      <PageHeader title="Company Research" description="Company overviews from public sources (Wikipedia and, when AI is configured, Google Search with citations). Every fact links to its source and retrieval date." />
      <Card title="Research a company">
        <ActionForm action={researchAction} className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="name">
              Company name
            </label>
            <input id="name" name="name" className="input" required />
          </div>
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="website">
              Website (optional)
            </label>
            <input id="website" name="website" className="input" placeholder="https://" />
          </div>
          <SubmitButton pendingText="Researching…">Research</SubmitButton>
        </ActionForm>
        {d.suggestions.length > 0 && (
          <p className="mt-3 text-sm text-ink-2">
            From your applications:{" "}
            {d.suggestions.map((s: any, i: number) => (
              <span key={s.company}>
                {i > 0 && ", "}
                <span className="font-medium">{s.company}</span>
              </span>
            ))}
          </p>
        )}
      </Card>
      {d.companies.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {d.companies.map((c: any) => (
            <Link key={c.id} href={`/app/companies/${c.id}`} className="card flex gap-3 p-4 hover:border-line-strong">
              <Lettermark name={c.name} />
              <div className="min-w-0">
                <p className="font-medium">{c.name}</p>
                <p className="truncate text-sm text-ink-2">{c.industry ?? "—"}</p>
                <p className="text-xs text-muted">Researched {fmtDate(c.researched_at)}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Building2 className="size-6" />} title="No research yet" />
      )}
    </div>
  );
}

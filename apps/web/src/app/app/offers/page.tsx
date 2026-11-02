import Link from "next/link";
import { NEGOTIATION_TIPS, takeHome } from "@careerflow/core";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client";
import { ResultPanel } from "@/components/forms";
import { Badge, Card, EmptyState, fmtDate, Notice, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { deleteOfferAction, offerManualAction, offerStatusAction, offerUploadAction, takeHomeAction } from "../_actions/misc";

export const metadata = { title: "Offers & Salary" };

const lpa = (n: number | null) => (n === null || n === undefined ? "—" : `₹${(Number(n) / 1e5).toFixed(2)} L`);

export default async function Offers() {
  const d = await withUser(async (tx) => ({
    offers: await tx.query("select * from offers order by created_at desc"),
    apps: await tx.query("select id, company, role_title from applications where not archived order by last_activity_at desc limit 100"),
    cp: await tx.one("select current_ctc_lpa, expected_ctc_min_lpa, expected_ctc_max_lpa from career_profiles limit 1"),
  }));
  const withNet = d.offers.map((o: any) => ({ ...o, net: o.fixed_ctc ? takeHome({ annualFixedCtc: Number(o.fixed_ctc), pfMode: "capped" }) : null }));
  return (
    <div className="space-y-6">
      <PageHeader title="Offers & Salary" description="Analyse offer letters, compare offers side by side, estimate take-home pay and prepare negotiation. Not a substitute for legal or financial advice." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Offer letter analyzer" description="Stored privately as a sensitive document. Fields not found in the letter are listed as missing, not guessed.">
          <ActionForm action={offerUploadAction} resetOnSuccess className="grid gap-2">
            <input name="company" className="input" placeholder="Company *" required />
            <input name="roleTitle" className="input" placeholder="Role" />
            <select name="applicationId" className="input" aria-label="Application">
              <option value="">Link to application (optional)</option>
              {d.apps.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.company} · {a.role_title}
                </option>
              ))}
            </select>
            <input name="file" type="file" accept=".pdf,.docx" required className="input" aria-label="Offer letter" />
            <SubmitButton pendingText="Reading offer…">Analyse offer letter</SubmitButton>
          </ActionForm>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-accent">Or enter an offer manually</summary>
            <ActionForm action={offerManualAction} resetOnSuccess className="mt-3 grid gap-2 sm:grid-cols-2">
              <input name="company" className="input" placeholder="Company *" required />
              <input name="roleTitle" className="input" placeholder="Role" />
              <input name="fixedLpa" type="number" step="0.01" className="input" placeholder="Fixed CTC (LPA)" />
              <input name="variableLpa" type="number" step="0.01" className="input" placeholder="Variable (LPA)" />
              <input name="joiningLpa" type="number" step="0.01" className="input" placeholder="Joining bonus (LPA)" />
              <input name="joiningDate" type="date" className="input" aria-label="Joining date" />
              <input name="noticePeriodDays" type="number" className="input" placeholder="Notice period (days)" />
              <input name="location" className="input" placeholder="Location" />
              <input name="benefits" className="input sm:col-span-2" placeholder="Benefits (comma separated)" />
              <SubmitButton className="btn btn-secondary btn-sm w-fit">Add offer</SubmitButton>
            </ActionForm>
          </details>
        </Card>
        <Card title="Take-home calculator" description="India, new tax regime FY 2025-26. Approximate.">
          <ResultPanel action={takeHomeAction} kind="takehome" submitLabel="Calculate">
            <div className="grid gap-2 sm:grid-cols-2">
              <input name="fixedLpa" type="number" step="0.01" className="input" placeholder="Fixed CTC (LPA)" defaultValue={d.cp?.expected_ctc_min_lpa ?? ""} required aria-label="Fixed CTC in lakhs" />
              <input name="variableLpa" type="number" step="0.01" className="input" placeholder="Variable (LPA)" aria-label="Variable pay in lakhs" />
              <label className="text-sm">
                Basic as % of fixed
                <input name="basicPct" type="number" defaultValue={40} className="input mt-1" />
              </label>
              <label className="text-sm">
                Professional tax / year (₹)
                <input name="pt" type="number" defaultValue={2400} className="input mt-1" />
              </label>
              <select name="pfMode" className="input" defaultValue="capped" aria-label="PF">
                <option value="capped">PF on ₹15,000 wage ceiling</option>
                <option value="full">PF on full basic</option>
                <option value="none">No PF</option>
              </select>
              <div className="space-y-1 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="employerPfInCtc" defaultChecked /> Employer PF is part of CTC
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="gratuityInCtc" /> Gratuity is part of CTC
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="includeVariable" /> Include variable pay
                </label>
              </div>
            </div>
          </ResultPanel>
        </Card>
      </div>

      <Card title="Offer comparison">
        {withNet.length ? (
          <div className="overflow-x-auto">
            <table className="table w-full min-w-[760px]">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Fixed</th>
                  <th>Variable</th>
                  <th>Joining bonus</th>
                  <th>Approx. monthly in-hand</th>
                  <th>Joining</th>
                  <th>Notice</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {withNet.map((o: any) => (
                  <tr key={o.id}>
                    <td>
                      <span className="font-medium">{o.company}</span>
                      {o.role_title && <span className="block text-xs text-muted">{o.role_title}</span>}
                      {o.missing_fields?.length > 0 && <span className="block text-xs text-warn">Missing: {o.missing_fields.join(", ")}</span>}
                      {o.clauses?.length > 0 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-accent">{o.clauses.length} clause(s) to check</summary>
                          <ul className="mt-1 space-y-1">
                            {o.clauses.map((c: any, i: number) => (
                              <li key={i}>
                                <span className="font-medium">{c.title}</span>: {c.note ?? c.text}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td>{lpa(o.fixed_ctc)}</td>
                    <td>{lpa(o.variable_pay)}</td>
                    <td>{lpa(o.joining_bonus)}</td>
                    <td>{o.net ? `₹${o.net.monthlyNet.toLocaleString("en-IN")}` : "—"}</td>
                    <td>{fmtDate(o.joining_date)}</td>
                    <td>{o.notice_period_days ? `${o.notice_period_days} d` : "—"}</td>
                    <td>
                      <ActionForm action={offerStatusAction} className="flex gap-1">
                        <input type="hidden" name="id" value={o.id} />
                        <select name="status" defaultValue={o.status} className="input w-auto py-1 text-xs" aria-label="Decision">
                          {["evaluating", "negotiating", "accepted", "declined", "expired"].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                        <SubmitButton className="btn btn-ghost btn-sm">Save</SubmitButton>
                      </ActionForm>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {o.document_id && (
                          <a href={`/api/documents/${o.document_id}`} className="btn btn-ghost btn-sm">
                            Letter
                          </a>
                        )}
                        <ActionButton action={deleteOfferAction} fields={{ id: o.id }} className="btn btn-ghost btn-sm text-bad" confirm="Delete this offer?">
                          Delete
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">In-hand estimates assume PF on the ₹15,000 ceiling, 40% basic and no variable pay. Use the calculator for your exact breakup.</p>
          </div>
        ) : (
          <EmptyState title="No offers yet">Upload an offer letter or add one manually to compare.</EmptyState>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Salary negotiation coach">
          {d.cp?.expected_ctc_min_lpa && (
            <Notice tone="info">
              Your profile: current ₹{d.cp.current_ctc_lpa ?? "—"} LPA, expected ₹{d.cp.expected_ctc_min_lpa}
              {d.cp.expected_ctc_max_lpa ? `–${d.cp.expected_ctc_max_lpa}` : ""} LPA.
            </Notice>
          )}
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-2">
            {NEGOTIATION_TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <Link href="/app/messages?kind=salary_negotiation" className="btn btn-secondary btn-sm mt-3">
            Draft a negotiation email
          </Link>
        </Card>
        <Card title="Decision checklist">
          <ul className="space-y-1.5 text-sm text-ink-2">
            {["Fixed vs variable split and how variable is paid", "Role, team and growth path", "Notice period buyout and joining date", "Probation terms and confirmation process", "Clauses: bond, non-compete, clawback, relocation", "Benefits: health insurance coverage and family", "Location, commute and work mode", "Background verification steps"].map((x) => (
              <li key={x}>☐ {x}</li>
            ))}
          </ul>
          <div className="mt-3">
            <Badge tone="warn">Have a qualified professional review legal or tax questions.</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}

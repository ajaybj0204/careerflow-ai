import { ResultPanel } from "@/components/forms";
import { Badge, Card, fmtDate, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { scamAction } from "../_actions/misc";

export const metadata = { title: "Scam Detector" };

export default async function ScamCheck() {
  const history = await withUser((tx) => tx.query("select * from scam_checks order by created_at desc limit 10"));
  return (
    <div className="space-y-6">
      <PageHeader title="Job Scam Detector" description="Paste a job post, recruiter email or WhatsApp message. CareerFlow lists evidence-based warning signs. It cannot prove a job is genuine and does not accuse anyone." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Check a message" className="lg:col-span-2">
          <ResultPanel action={scamAction} kind="scam" submitLabel="Check for warning signs">
            <textarea name="text" rows={8} className="input" placeholder="Paste the job post or message" required aria-label="Message" />
            <div className="grid gap-2 sm:grid-cols-2">
              <input name="sender" className="input" placeholder="Sender email (optional)" />
              <input name="company" className="input" placeholder="Company it claims to be (optional)" />
            </div>
          </ResultPanel>
        </Card>
        <Card title="Recent checks">
          {history.length ? (
            <ul className="space-y-2 text-sm">
              {history.map((h: any) => (
                <li key={h.id}>
                  <Badge tone={h.risk_level === "high" ? "bad" : h.risk_level === "medium" ? "warn" : "good"}>{h.risk_level}</Badge>{" "}
                  <span className="text-ink-2">{h.input_excerpt.slice(0, 80)}…</span>
                  <span className="block text-xs text-muted">{fmtDate(h.created_at, true)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">No checks yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

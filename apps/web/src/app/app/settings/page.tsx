import { CheckCircle2, CircleSlash, Mail } from "lucide-react";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client";
import { ExtensionTokenForm } from "@/components/forms";
import { Badge, Card, fmtDate, Notice, PageHeader, timeAgo } from "@/components/ui";
import { integrationStatus } from "@/lib/config";
import { withUser } from "@/lib/session";
import { deleteAccountAction, extensionTokenAction, gmailDisconnectAction, gmailImportAction, gmailReprocessAction, gmailSyncNowAction, preferencesAction, revokeExtensionTokenAction } from "../_actions/misc";

export const metadata = { title: "Settings" };

const NOTIF: [string, string][] = [
  ["application_detected", "New application detected"],
  ["recruiter_reply", "Recruiter replies"],
  ["status_update", "Status updates"],
  ["assessment_received", "Assessment received"],
  ["assessment_deadline", "Assessment deadline"],
  ["interview_invitation", "Interview invitations"],
  ["interview_rescheduled", "Interview rescheduled"],
  ["offer_received", "Offers"],
  ["follow_up_due", "Follow-ups due"],
  ["new_matching_job", "New matching jobs"],
  ["review_needed", "Items needing review"],
  ["gmail_sync_failure", "Gmail sync failures"],
  ["authorization_expired", "Authorization expired"],
];

export default async function Settings({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const sp = await searchParams;
  const s = integrationStatus();
  const d = await withUser(async (tx) => ({
    conn: await tx.one("select google_email, status, last_error, connected_at, scopes from gmail_connections limit 1"),
    sync: await tx.one("select * from gmail_sync_state limit 1"),
    prefs: await tx.one("select * from user_preferences limit 1"),
    errors: await tx.query("select job_type, error, created_at from automation_errors order by created_at desc limit 5"),
    counts: await tx.one("select (select count(*)::int from processed_messages where outcome <> 'ignored') as tracked, (select count(*)::int from processed_messages where outcome = 'ignored') as ignored"),
  }));
  const np = d.prefs?.notification_prefs ?? {};
  const gmailMsg: Record<string, [string, "good" | "bad" | "warn"]> = {
    connected: ["Gmail connected. Choose how far back to import below.", "good"],
    denied: ["Gmail access was not granted.", "warn"],
    error: ["Gmail connection failed. Please try again.", "bad"],
    norefresh: ["Google did not return a refresh token. Remove CareerFlow at myaccount.google.com/permissions and connect again.", "bad"],
    notconfigured: ["Google OAuth is not configured on the server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / TOKEN_ENCRYPTION_KEY).", "warn"],
  };
  const row = (label: string, ok: boolean, detail?: string) => (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      {ok ? <CheckCircle2 className="size-4 text-good" /> : <CircleSlash className="size-4 text-muted" />}
      <span className="flex-1">{label}</span>
      <span className="text-xs text-muted">{detail ?? (ok ? "Configured" : "Not configured")}</span>
    </li>
  );
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Connections, privacy, notifications and your data." />
      {sp.gmail && gmailMsg[sp.gmail] && <Notice tone={gmailMsg[sp.gmail][1]}>{gmailMsg[sp.gmail][0]}</Notice>}

      <Card id="gmail" title="Gmail connection" description="Read-only access to detect application emails. CareerFlow never sends, deletes or changes your email.">
        {d.conn ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Mail className="size-4" />
              <span className="font-medium">{d.conn.google_email}</span>
              <Badge tone={d.conn.status === "active" ? "good" : "bad"}>{d.conn.status}</Badge>
              <span className="text-muted">connected {fmtDate(d.conn.connected_at)}</span>
            </div>
            {d.conn.status !== "active" && (
              <Notice tone="bad" title="Reconnect needed">
                {d.conn.last_error ?? "Google access expired or was revoked."} <a className="link" href="/api/gmail/connect">Reconnect Gmail</a>
              </Notice>
            )}
            <div className="grid gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-lg bg-surface-2 p-3">
                <p className="text-xs text-muted">Last sync</p>
                <p>{d.sync?.last_synced_at ? timeAgo(d.sync.last_synced_at) : "Not yet"}</p>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <p className="text-xs text-muted">Live updates</p>
                <p>{s.gmailPush ? (d.sync?.watch_expiration ? `Push until ${fmtDate(d.sync.watch_expiration)}` : "Push pending") : "Polling fallback"}</p>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <p className="text-xs text-muted">Job emails tracked</p>
                <p>{d.counts?.tracked ?? 0}</p>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <p className="text-xs text-muted">Unrelated emails skipped</p>
                <p>{d.counts?.ignored ?? 0}</p>
              </div>
            </div>
            {d.sync?.import_status && d.sync.import_status !== "idle" && (
              <p className="text-sm">
                Historical import: <Badge tone={d.sync.import_status === "completed" ? "good" : d.sync.import_status === "failed" ? "bad" : "info"}>{d.sync.import_status}</Badge>{" "}
                <span className="text-ink-2">
                  {Object.entries(d.sync.import_counts ?? {})
                    .map(([k, v]) => `${v} ${k}`)
                    .join(" · ")}
                </span>
              </p>
            )}
            {d.sync?.last_error && <p className="text-sm text-bad">Last error: {d.sync.last_error}</p>}
            <div className="flex flex-wrap gap-3">
              <ActionForm action={gmailImportAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3">
                <div>
                  <label className="label" htmlFor="range">
                    Import past emails
                  </label>
                  <select id="range" name="range" className="input w-auto">
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="180">Last 6 months</option>
                    <option value="365">Last year</option>
                    <option value="custom">Custom range</option>
                  </select>
                </div>
                <input name="from" type="date" className="input w-auto" aria-label="Custom from" />
                <input name="to" type="date" className="input w-auto" aria-label="Custom to" />
                <SubmitButton className="btn btn-primary btn-sm">Start import</SubmitButton>
              </ActionForm>
              <div className="flex flex-col justify-end gap-2">
                <ActionButton action={gmailSyncNowAction} className="btn btn-secondary btn-sm" pendingText="Checking…">
                  Check for new emails now
                </ActionButton>
                <ActionButton action={gmailReprocessAction} className="btn btn-ghost btn-sm">
                  Re-check emails needing review
                </ActionButton>
              </div>
            </div>
            <ActionForm action={gmailDisconnectAction} confirm="Disconnect Gmail? CareerFlow will revoke its access and delete stored tokens." className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="deleteData" /> Also delete imported email metadata
              </label>
              <SubmitButton className="btn btn-danger btn-sm">Disconnect Gmail</SubmitButton>
            </ActionForm>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5 text-ink-2">
              <li>Permission requested: read your Gmail (gmail.readonly). No sending, deleting or modifying.</li>
              <li>Only messages matching job-related search terms are fetched. Unrelated emails are skipped and nothing about them is stored.</li>
              <li>For job emails, only sender, subject, date and a short snippet are stored. Full bodies are processed in memory and discarded.</li>
              <li>If you allow AI processing, unclear job emails may have their first 3,000 characters sent to Google Gemini for classification.</li>
              <li>Tokens are encrypted (AES-256-GCM). You can disconnect at any time.</li>
            </ul>
            {s.googleOAuth && s.tokenEncryption ? (
              <a href="/api/gmail/connect" className="btn btn-primary">
                Connect Gmail
              </a>
            ) : (
              <Notice tone="warn" title="Not available yet">
                Gmail needs Google OAuth credentials and TOKEN_ENCRYPTION_KEY on the server. See docs/GOOGLE_CLOUD_SETUP.md.
              </Notice>
            )}
          </div>
        )}
      </Card>

      <Card title="Privacy and notifications">
        <ActionForm action={preferencesAction} className="space-y-5">
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="aiConsent" defaultChecked={d.prefs?.ai_processing_consent} className="mt-1" />
              <span>
                <span className="font-medium">Allow AI processing</span>
                <span className="block text-ink-2">Verified profile facts, job descriptions and your inputs are sent to {s.ai ? `Google Gemini (${s.aiModel})` : "the AI provider (not configured)"} when you use AI features. Only metadata (feature, size, status) is logged.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="transcriptConsent" defaultChecked={d.prefs?.transcript_consent} className="mt-1" />
              <span>
                <span className="font-medium">Keep mock interview transcripts by default</span>
                <span className="block text-ink-2">Otherwise only feedback is kept after each session.</span>
              </span>
            </label>
          </div>
          <div>
            <p className="label">In-app notifications</p>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {NOTIF.map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={`n_${k}`} defaultChecked={np[k] !== false} /> {l}
                </label>
              ))}
            </div>
          </div>
          <div className="max-w-xs">
            <label className="label" htmlFor="alertFrequency">
              Default job alert frequency
            </label>
            <select id="alertFrequency" name="alertFrequency" className="input" defaultValue={d.prefs?.alert_frequency ?? "daily"}>
              <option value="off">Off</option>
              <option value="instant">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <SubmitButton>Save preferences</SubmitButton>
        </ActionForm>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Chrome extension" description="A personal token lets the extension save jobs to your account. Only a hash is stored.">
          <p className="mb-3 text-sm text-ink-2">{d.prefs?.extension_token_sha256 ? `A token is active (created ${fmtDate(d.prefs.extension_token_created_at)}).` : "No token yet."}</p>
          <div className="flex flex-wrap gap-2">
            <ExtensionTokenForm action={extensionTokenAction} />
            {d.prefs?.extension_token_sha256 && (
              <ActionButton action={revokeExtensionTokenAction} className="btn btn-ghost btn-sm text-bad">
                Revoke
              </ActionButton>
            )}
          </div>
        </Card>
        <Card title="Integration status" description="Shown so nothing is presented as connected when it is not.">
          <ul>
            {row("Authentication", s.supabase, s.supabase ? "Supabase + Google" : "Local test mode")}
            {row("Database", true, s.database)}
            {row("File storage", true, s.storage)}
            {row("Google OAuth (Gmail)", s.googleOAuth)}
            {row("Token encryption key", s.tokenEncryption)}
            {row("Gmail push (Pub/Sub)", s.gmailPush, s.gmailPush ? "Configured" : "Polling fallback")}
            {row("AI (Gemini)", s.ai, s.ai ? s.aiModel : "Not configured")}
            {row("Adzuna job API", s.adzuna)}
            {row("Background jobs secret", s.cronSecret)}
          </ul>
        </Card>
      </div>

      {d.errors.length > 0 && (
        <Card title="Recent background errors">
          <ul className="space-y-1.5 text-sm">
            {d.errors.map((e: any, i: number) => (
              <li key={i}>
                <span className="font-medium">{e.job_type}</span> <span className="text-ink-2">· {e.error}</span> <span className="text-xs text-muted">· {timeAgo(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Export your data" description="A ZIP with all your records as JSON plus your files. Google tokens are never exported.">
          <a href="/api/account/export" className="btn btn-secondary">
            Download my data
          </a>
        </Card>
        <Card title="Delete account" description="Revokes Gmail, deletes your files and every record. This cannot be undone.">
          <ActionForm action={deleteAccountAction} className="flex flex-wrap gap-2">
            <input name="confirm" className="input w-40" placeholder="Type DELETE" aria-label="Type DELETE to confirm" />
            <SubmitButton className="btn btn-danger">Delete my account</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}

# Security and privacy

## Data isolation
- Every user-owned table has `user_id` and Row Level Security (`user_id = auth.uid()`).
- Server code runs user requests inside a transaction as the `authenticated` role with the user's id in
  `request.jwt.claims`, so RLS applies to every query — on Supabase and on local PGlite alike.
- Trusted automation (workers, token storage, sign-up) uses the `service_role` path explicitly (`db.asService`).
- Tested: cross-user reads return nothing, cross-user writes fail, the event log cannot be edited (`tests/database.rls.test.ts`).

## Google / Gmail
- Sign-in and Gmail are separate consents. Gmail uses only `gmail.readonly` (+ `openid email`).
- Refresh and access tokens are encrypted with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) and stored in columns the
  `authenticated` role cannot select (column-level grants). They are never sent to the browser or exported.
- OAuth `state` is HMAC-signed, expiring, and bound to the signed-in user.
- Only job-related search results are fetched. Unrelated messages are skipped and only their id is stored.
  For job emails, only sender, subject, date and a ≤300-character snippet are stored; bodies are discarded.
- Disconnect revokes the token at Google, stops push, deletes tokens and queued jobs, and optionally the metadata.
- `gmail.readonly` is a **restricted scope**: public launch requires Google OAuth verification and an annual
  CASA security assessment. Until then, add testers as "test users" on the consent screen.
- Pub/Sub push requests must carry a valid Google-signed OIDC token for `PUBSUB_PUSH_AUDIENCE`.

## AI
- AI processing requires user consent (onboarding/Settings). Only verified profile facts, the relevant job
  description and the user's input are sent. Email excerpts are capped at 3,000 characters and only for
  uncertain classifications.
- All third-party text (emails, job descriptions, uploaded documents, web pages, screenshots) is wrapped as
  untrusted data with system rules forbidding instruction-following from it.
- Model output is schema-validated; invalid output is retried once then refused. Resume/letter/answer text
  passes a fabrication guard (new skills, numbers, organisations are blocked or flagged).
- `ai_audit_logs` records feature, model, sizes and status only — never prompts or outputs.

## Web application
- Secrets are server-only (`server-only` imports); the Supabase service key is never exposed to the browser.
- Session cookies: httpOnly, SameSite=Lax, Secure in production. Local test sign-in is disabled in production
  unless `ALLOW_LOCAL_AUTH=true` is set deliberately.
- Input validation with Zod on server actions and API routes; safe redirects (`safeNext`) allow relative paths only.
- Uploads: size limit (10 MB), MIME + extension + magic-byte checks, private storage keys per user/document.
  Downloads are served with `Content-Disposition`, `nosniff` and a sandboxing CSP.
- CSV/Excel exports neutralise formula injection.
- Security headers: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Rate limits on AI, uploads, discovery, sync, exports and the extension API (in-memory per instance —
  use a shared store such as Upstash Redis when running multiple instances).
- `/api/cron/tick` requires `CRON_SECRET` in production (constant-time compare).

## Chrome extension
- Manifest V3 with `activeTab`, `scripting`, `storage` only; no content scripts, no background page, no broad
  host permissions. Host access is requested for the user's CareerFlow origin only.
- Reads a page only when the user clicks "Capture". Never stores portal passwords, never submits forms.
  Marking an application as submitted requires an explicit confirmation click.
- Personal access tokens are random 192-bit values; only a SHA-256 hash is stored; revocable in Settings.

## Account controls
- Data export: ZIP of all records (JSON) and files, without tokens.
- Account deletion: revokes Gmail, deletes stored files, deletes the auth user (all rows cascade).

## Reporting
Please report vulnerabilities privately to the project owner rather than opening a public issue.

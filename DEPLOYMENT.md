# Deployment (GitHub + Vercel + Supabase + Google Cloud)

Target: low running cost. Everything below has a free tier; limits are noted.

## 1. Supabase
Follow [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md): create the project, enable Google sign-in, run migrations,
and collect `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`.

## 2. Google Cloud
Follow [docs/GOOGLE_CLOUD_SETUP.md](docs/GOOGLE_CLOUD_SETUP.md): OAuth client for Gmail, optional Pub/Sub push,
and a Gemini API key.

## 3. Vercel
1. Push the repository to GitHub (private repo recommended).
2. In Vercel: **Add New → Project → import the repo**.
   - Root directory: `apps/web`
   - Framework: Next.js (auto). Build command: default. Install command: `npm install` (Vercel installs from the repo root because of workspaces; if not, set Install Command to `cd ../.. && npm install`).
3. Environment variables (Production): everything from `.env.example` that you use, plus
   `APP_URL=https://<your-domain>`, `SESSION_SECRET`, `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`.
4. Deploy. Then add the deployed URL to:
   - Supabase → Authentication → URL configuration (Site URL and redirect `https://<domain>/auth/callback`),
   - Google OAuth client → authorised redirect URI `https://<domain>/api/gmail/callback`.

## 4. Background jobs
The app never relies on an open browser. Pick one or more:
- **Vercel Cron** (`apps/web/vercel.json`): daily on the Hobby plan (Hobby crons run at most once per day).
- **GitHub Actions** (`.github/workflows/scheduler.yml`): every 15 minutes, free. Add repo secrets `APP_URL` and `CRON_SECRET`.
- **Gmail push** via Pub/Sub: near-real-time for new emails; push only queues jobs, so pair it with one of the above.
- **Standalone worker** (`npm run worker` with `APP_URL` and `CRON_SECRET`) on any always-on machine.

## 5. Exact PDFs (optional)
Vercel functions do not include LibreOffice, so tailored-resume PDFs use the simplified layout there (the DOCX is
always exact). For identical PDFs, run the app in a container with LibreOffice (`SOFFICE_PATH`), or export the DOCX
to PDF from Word/Google Docs.

## Cost notes
- Supabase free: 500 MB database, 1 GB storage, pauses after a week of inactivity.
- Vercel Hobby: personal, non-commercial use; 1 daily cron.
- Gemini: free tier with rate limits; paid usage billed per token beyond it.
- Gmail API and Pub/Sub: free at personal volumes.
- Adzuna: free developer key with request limits.
- Google OAuth verification is free, but the CASA assessment required for restricted scopes before public launch can cost money.

## Acceptance checklist (run after configuring)
1. Sign in with Google → profile rows created → onboarding.
2. Settings → Connect Gmail → consent shows read-only Gmail → "connected".
3. Import last 30 days → progress counts appear → applications created from confirmations; unclear emails in Needs Review.
4. Send yourself a test "Thank you for applying to <Company>" email → after the next tick (or push) it appears.
5. Revoke CareerFlow at myaccount.google.com/permissions → next sync shows "Reconnect Gmail" notification.
6. Upload a DOCX resume → confirm facts → tailor with AI → blocked suggestions show reasons → DOCX opens in Word with the original formatting.
7. Generate a cover letter and an application package ZIP.
8. Copilot answers "Why should we hire you?" using only verified facts.
9. Run `/api/cron/tick` with the secret; check Settings for background errors.
10. Sign in as a second Google account and confirm no data from the first is visible.

# CareerFlow AI — Implementation Status

Last updated: 2026-11-02. This file is the persistent checklist for future sessions. Be strict: only mark something
**Verified** when it was actually executed.

Legend
- ✅ **Built + verified** — implemented and exercised (automated test and/or in-browser check).
- 🟡 **Built, not verified live** — code complete and unit/integration-tested with fakes, but not run against the real external service because credentials were not available.
- ⬜ **Not built** — missing; see notes.

## Verification run (2026-11-02)
- `npm test` → **52 tests passed** across 5 files (database/RLS, document engine, Gmail automation, features, extension).
- `npm run typecheck` → clean (packages, tests, worker, web).
- `npm run build` → production build succeeded (47 routes).
- `npm run extension:build` → manifest validated, 7 files in `apps/extension/dist`.
- In-browser (local test mode, `localhost:3100`): all 31 app pages returned 200 with no errors. Exercised end to end:
  sign-in → onboarding → master resume upload (DOCX) → confirm extracted facts → paste JD → job match report (90/100) →
  manual tailoring edit → DOCX + PDF generated and downloaded (valid files) → Copilot factual answer → Scam Detector →
  take-home calculator → mock interview with feedback → extension token + extension API (save, duplicate prevention,
  lookup, answers, 401 on bad token) → scheduler tick ran reminder/strategy/follow-up jobs → analytics → mobile width
  (375px, no horizontal overflow).

## External credentials still needed (user action)
| Integration | Needed | Status |
|---|---|---|
| Supabase (Auth with Google, Postgres, Storage) | project URL, anon key, service role key, `DATABASE_URL` | 🟡 code complete; local mode used instead |
| Google OAuth for Gmail | OAuth client ID/secret, consent screen, test users | 🟡 |
| Token encryption | `TOKEN_ENCRYPTION_KEY` | ✅ logic tested |
| Gmail push | Pub/Sub topic + push subscription with OIDC auth | 🟡 |
| Google Gemini | `GEMINI_API_KEY` | 🟡 tested with fakes/mocked HTTP |
| Adzuna jobs API (India listings) | free app id/key | 🟡 |
| Vercel deployment + `CRON_SECRET` | Vercel project | ⬜ not deployed |
| LibreOffice on the server (exact PDF) | install / container | ⬜ falls back to simplified PDF |
| Google OAuth verification + CASA (restricted scope) | before public launch | ⬜ user/legal process |

## Feature checklist

### Foundation
- ✅ npm-workspaces monorepo (`apps/web`, `apps/worker`, `apps/extension`, `packages/*`)
- ✅ Postgres schema (60+ tables), migrations, RLS on every user table, column-level grants hiding OAuth tokens
- ✅ Same migrations run locally on PGlite (real Postgres in WASM) and on Supabase
- ✅ Local test-mode auth (clearly labelled) · 🟡 Supabase Google sign-in + session middleware
- ✅ App shell: grouped sidebar, mobile drawer, Ctrl+K page search, dark/light mode, toasts, empty states
- ✅ Private file storage (local disk) · 🟡 Supabase Storage adapter + bucket policies migration

### Engine A — Career Memory
- ✅ Provenance on every fact (user_verified / document_extracted / ai_suggested / hypothetical / unverified)
- ✅ Only verified facts reach AI context; in-progress/idea projects explicitly excluded
- ✅ Resume extraction → unverified facts → user confirm/edit/remove
- ✅ Fabrication guard (new skills, numbers, organisations blocked)

### Engine B — Automation
- ✅ Append-only event log with dedupe keys
- ✅ Guarded status changes (manual lock, forward-only, high-impact outcomes need ≥0.85 confidence, else review)
- ✅ Job queue with leasing, retries, exponential backoff, dead-lettering, error log
- ✅ Scheduler tick (Vercel Cron / GitHub Actions / `apps/worker`) · ✅ follow-ups, reminders, strategy refresh

### Engine C — Strategy
- ✅ Metrics with stated denominators, by platform/role/location, weekly series, resume-version comparison
- ✅ Evidence-backed recommendations with minimum sample sizes · 🟡 AI narrative summary

### Gmail
- ✅ Rule-based classifier (confirmations, acknowledgements, outreach, assessments, interviews, reschedules, rejections, offers, closures, newsletters)
- ✅ Matching with confidence thresholds (thread, job id, company, domain, title, recruiter, timeline); same-company disambiguation
- ✅ Separate confirmation vs submission timestamps; no auto-reject on ambiguous evidence; review queue
- ✅ Historical import (paged via job queue), history-API sync, 404 history recovery via polling, token-expiry handling, disconnect + revoke
- 🟡 Real OAuth flow, Gmail API calls, Pub/Sub push verification, watch renewal (tested with fake API / mocked fetch only)
- 🟡 AI refinement of uncertain emails (minimal 3,000-char excerpt, consent-gated)

### Applications & workspace
- ✅ Tracker: search, filters, sort, date range, bulk actions, CSV/Excel export, timeline view, duplicate detection
- ✅ Universal Workspace tabs: overview, JD, documents, questions, communication, prep, timeline, analytics
- ✅ Saved → applied in the same record; manual status lock/unlock; tasks; notes; interviews; assessments

### Documents
- ✅ Template-preserving DOCX editing (styles, numbering, margins, run formatting kept; locked paragraphs)
- ✅ PDF export (simplified layout without LibreOffice; exact via LibreOffice when installed — 🟡 not tested, LibreOffice absent)
- ✅ Page/length overflow warnings · ✅ cover letter DOCX/PDF · ✅ ZIP application package · ✅ document vault with versions
- ✅ PDF-only resume → rebuilt editable template requiring approval (logic built; 🟡 not exercised in browser)
- ⬜ `.doc` (legacy Word) uploads — user is asked to save as `.docx`

### AI features (all 🟡 live; ✅ with fake provider in tests)
- JD analysis (✅ rule-based fallback), tailoring suggestions with guard, cover letters, Copilot (✅ factual answers from profile without AI), screenshot question extraction (multimodal), outreach drafts (✅ templates without AI), LinkedIn suggestions (✅ template without AI), company research with grounding (✅ Wikipedia path built, 🟡 not exercised live), mock interview turns/feedback (✅ rule-based fallback), scenario feedback (✅ rule-based), post-interview analysis (✅ rule-based), learning plans (✅ rule-based)
- ✅ Output validation: schema check, one retry, then refusal; audit log stores metadata only
- ✅ Prompt-injection wrapping of all third-party text

### Other modules
- ✅ Job Portal Hub (15 portals, URLs checked 2026-11-02, keyword search links, favourites, custom portals, saved searches)
- ✅ Job discovery ranking + dedupe + freshness labels · 🟡 live fetch from Remotive/Arbeitnow/Adzuna not exercised in this session
- ✅ Interview Studio (role guides ×8, Interview Tomorrow 15/30/60/120 + PDF, mock interviews with optional browser voice input, weakness tracker, post-interview loop, question bank)
- ✅ Scenario Lab (10 scenarios) · ✅ Skills Academy (25 auto-checked exercises, gap analysis, 7/30/90/custom plans, progress from completed activities)
- ✅ Offers: analyzer (regex + 🟡 AI), comparison, take-home calculator (FY 2025-26 new regime, assumptions shown), negotiation coach
- ✅ Scam detector · ✅ Recruiter CRM · ✅ recruiter message drafts (never auto-sent; "Open in Gmail")
- ✅ Fresher Launchpad (readiness from real data) · ✅ Experienced tools (transferable skills, progression, gaps, leadership questions)
- ✅ Notifications (in-app, per-type preferences, weekly/monthly summaries) · ✅ Calendar & tasks
- ✅ Data export (ZIP, no tokens) · ✅ account deletion (local) · 🟡 Supabase user deletion
- ✅ Chrome extension (MV3, minimal permissions, explicit capture, duplicate check, confirmed "applied", copy-only autofill suggestions) · 🟡 not loaded in a real Chrome profile

## Known gaps / next steps (in priority order)
1. Configure Supabase + Google OAuth + Gemini and run the live checks in `DEPLOYMENT.md` → "Acceptance checklist".
2. Playwright end-to-end suite (only in-browser manual verification so far).
3. Browser push and email notifications (in-app only today).
4. Distributed rate limiting (current limiter is in-memory per instance).
5. Automated data-retention purge (e.g. delete `processed_messages` metadata older than N months).
6. Exact PDF rendering in production (LibreOffice container or a conversion service) and visual page diff.
7. Accessibility audit with axe; brand logos for portals (lettermarks used to avoid trademark misuse).
8. `.doc` conversion; PDF-template approval flow browser test.

## Acceptance criteria (spec §36)
| Criterion | Status |
|---|---|
| Secure account creation | ✅ local · 🟡 Supabase |
| Connect Gmail | 🟡 |
| Import historical applications | ✅ (fake Gmail) · 🟡 live |
| Confirmations create records | ✅ (fake Gmail) |
| Recruiter responses update the correct application | ✅ (fake Gmail) |
| Auditable status history | ✅ |
| Dashboard uses persisted data | ✅ |
| Upload master resume | ✅ |
| Paste a JD | ✅ |
| Truthful tailored documents | ✅ guard tested · 🟡 live AI |
| PDF and DOCX exports open | ✅ (files validated; opened as valid ZIP/PDF) |
| Formatting preserved within documented constraints | ✅ DOCX · PDF simplified without LibreOffice |
| Package links to the correct job | ✅ |
| Access job portals | ✅ |
| Grounded Copilot | ✅ profile answers · 🟡 AI |
| Application-specific interview prep | ✅ |
| Mock feedback from actual responses | ✅ |
| Strategy uses real data | ✅ |
| User data isolation | ✅ RLS tests |
| Background automation independent of browser | ✅ scheduler + worker · 🟡 hosted |
| Visible, recoverable errors | ✅ toasts, review queue, sync errors in Settings |
| Deployable and maintainable | ✅ build passes · ⬜ not deployed |

**CareerFlow AI is not production-ready yet**: the live integrations above must be configured and verified first.

## Live verification (2026-11-02, https://careerflow-ajaybj.vercel.app)
- ✅ Supabase project `careerflow-ai` (Mumbai): 5 migrations applied, RLS on all 60 tables, security advisor clean.
- ✅ Google sign-in via Supabase on the live site (session created, onboarding loaded from the database).
- ✅ Gemini AI on the live site (Copilot answer; missing profile facts listed instead of invented).
  Model `gemini-2.5-flash` was retired for new users → now `gemini-3.6-flash` with automatic fallbacks.
- ✅ Connect Gmail on the live site: read-only scope granted, tokens stored encrypted, sync checkpoint set via the Gmail API.
- ✅ Historical Gmail import on real mail (90 days): 38 applications created automatically, the rest sent to Needs Review.
- ✅ Frequent background schedule: GitHub Actions calls the tick every 15 minutes (secrets set, run verified 200). Vercel cron remains as a daily backup.
- ✅ Title-less confirmations (LinkedIn's newer layout, "Thank you for applying to X") now create applications; re-check raised tracked applications from 38 to 105 and cut Needs Review from 207 to 135.
- ✅ Visual redesign (2026-11-02): gradient brand, new logo/favicon, animated backgrounds and entrances, "Created by Ajay B J" credit.
- ⬜ Gmail push (Pub/Sub) not configured; polling fallback is used.
- Deployment: Vercel project `careerflow-ajaybj` builds `apps/web` from GitHub `ajaybj0204/careerflow-ai`. Production env vars are set in Vercel.

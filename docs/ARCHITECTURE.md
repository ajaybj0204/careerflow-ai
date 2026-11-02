# Architecture

```
Browser ──► Next.js (apps/web) ── server actions / API routes ──► packages/core ──► packages/database ──► Postgres (Supabase | PGlite)
   ▲                                    │                              │                                   (RLS per user)
   │                                    │                              ├─► packages/ai ──► Gemini
Chrome extension ── /api/extension ─────┘                              ├─► packages/gmail ──► Gmail API / OAuth
                                                                        ├─► packages/document-engine (DOCX/PDF/ZIP/CSV/XLSX)
Vercel Cron / GitHub Actions / apps/worker ──► /api/cron/tick ──► scheduler ──► job queue (automation_jobs)
Pub/Sub push ──► /api/gmail/push ──► enqueue gmail.sync
```

## The three engines
- **Career Memory** (`core/career-memory.ts`): builds the verified context every AI feature uses; imports extracted
  facts as unverified; `guard.ts` blocks fabricated skills/numbers/organisations.
- **Career Automation** (`core/automation.ts`, `gmail-sync.ts`, `scheduler.ts`): append-only events with dedupe keys,
  guarded status transitions, notifications, a leased job queue with retries and backoff.
- **Career Strategy** (`core/strategy.ts`): metrics with explicit denominators and evidence-backed recommendations.

## Key decisions
- **One application record from saved to offer.** The "workspace" is the application plus linked rows.
- **Same SQL everywhere.** Migrations and RLS run on Supabase and on PGlite locally/tests (`supabase/local/auth_shim.sql` emulates `auth.uid()`).
- **Rules first, AI second.** Email classification, JD analysis, interview feedback, scam detection and learning plans
  work without AI; AI improves them when configured and consented. Failures fall back to rules.
- **Template preservation by editing the user's DOCX**, never regenerating a resume from a stock template.
- **No browser-dependent automation.** All background work goes through the scheduler and queue.

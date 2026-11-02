# CareerFlow AI

**From job search to job offer, all in one place.** An AI-assisted career platform for job seekers in India:
one verified career profile and one application database connect job discovery, truthful tailored resumes,
Gmail-powered application tracking, interview preparation, skills, offers and strategy.

> Current state and what still needs credentials: see [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## Quick start (local test mode — no accounts needed)

Requirements: Node.js 20.18+ (tested on 24), npm.

```bash
npm install
npm run dev
```

Open http://localhost:3100 and sign in with any name/email. Local test mode uses:
- an embedded Postgres database (PGlite) in `.data/pglite` with the real migrations and Row Level Security,
- local file storage in `.data/storage`,
- a clearly labelled password-less development sign-in,
- rule-based features (no AI, no Gmail) until you add keys.

Background jobs (Gmail sync, imports, alerts, reminders) run when the scheduler is called:

```bash
npm run worker
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Web app on port 3100 |
| `npm run worker` | Background worker (calls `/api/cron/tick` on an interval) |
| `npm test` | Unit + integration tests (Vitest, in-memory Postgres) |
| `npm run typecheck` | TypeScript checks for all packages and the web app |
| `npm run build` | Production build |
| `npm run db:migrate` | Apply migrations (PGlite locally, or `DATABASE_URL`) |
| `npm run extension:build` | Build the Chrome extension into `apps/extension/dist` |

## Structure

```
apps/
  web/         Next.js App Router app (UI, server actions, API routes)
  worker/      Background worker (scheduler loop)
  extension/   Chrome extension (Manifest V3)
packages/
  shared/          statuses, skills dictionary, Zod schemas, text utils
  database/        PGlite/Postgres client with per-user RLS transactions, migration runner
  ai/              provider-independent AI interface + Gemini provider
  document-engine/ template-preserving DOCX editing, PDF, exports, resume parsing
  gmail/           OAuth, Gmail API client, email classifier, Pub/Sub verification, token crypto
  core/            the three engines and all feature logic (career memory, automation, strategy, …)
supabase/migrations  SQL migrations (shared by local and Supabase)
tests/               Vitest suites and fictional fixtures
docs/                setup guides, architecture, user guide
```

## Configuration

Copy `.env.example` to `apps/web/.env.local` and fill what you need. Guides:
- [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)
- [docs/GOOGLE_CLOUD_SETUP.md](docs/GOOGLE_CLOUD_SETUP.md)
- [DEPLOYMENT.md](DEPLOYMENT.md) (Vercel, scheduler, acceptance checklist)
- [SECURITY.md](SECURITY.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md)

## Principles

- Honest: AI never invents skills, numbers, employers or achievements; unknown facts are listed as missing.
- Privacy-first: per-user isolation, encrypted Google tokens, read-only Gmail, minimal data sent to AI.
- Nothing is sent, submitted or marked "rejected" without clear evidence or your confirmation.

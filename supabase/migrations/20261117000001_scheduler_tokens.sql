-- Extra bearer tokens accepted by /api/cron/tick (besides CRON_SECRET), e.g. for the Supabase pg_cron schedule.
-- Only a SHA-256 hash is stored here; the raw token lives where the caller keeps it (Supabase Vault for pg_cron).
create table if not exists public.scheduler_tokens (
  token_sha256 text primary key,
  label text not null,
  created_at timestamptz not null default now()
);
alter table public.scheduler_tokens enable row level security;
revoke all on public.scheduler_tokens from anon, authenticated;
grant select on public.scheduler_tokens to service_role;

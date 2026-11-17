-- When a Gmail check stopped early (time limit or Gmail quota) and will continue on the next run.
-- Settings shows "Catching up" while this is newer than last_synced_at.
alter table public.gmail_sync_state add column if not exists last_partial_at timestamptz;

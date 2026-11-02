-- Personal access token for the Chrome extension. Only a SHA-256 hash is stored.
alter table public.user_preferences add column if not exists extension_token_sha256 text;
alter table public.user_preferences add column if not exists extension_token_created_at timestamptz;
create unique index if not exists user_preferences_ext_token_uq on public.user_preferences (extension_token_sha256) where extension_token_sha256 is not null;

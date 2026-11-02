# Supabase setup

1. Create a project at https://supabase.com (region: Mumbai `ap-south-1` for India). Save the database password.
2. **Run migrations** (either):
   - Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push` (uses `supabase/migrations`, including the storage policy file), or
   - `DATABASE_URL=<connection string> npm run db:migrate` from the repo root.
   Do **not** run `supabase/local/auth_shim.sql` on Supabase — it is for local PGlite only.
3. **Connection string**: Project Settings → Database → Connection string → *Transaction pooler* (port 6543). Use it as `DATABASE_URL`.
   The app connects as `postgres` and switches to the `authenticated` role per request, so RLS applies.
4. **Keys**: Project Settings → API → `URL` → `NEXT_PUBLIC_SUPABASE_URL`, `anon` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (server only).
5. **Google sign-in**: Authentication → Providers → Google → enable, paste a Google OAuth client ID/secret
   (a *separate* OAuth client from the Gmail one is fine) and add Supabase's callback URL shown there to that Google client.
6. **URL configuration**: Authentication → URL Configuration → Site URL = your app URL; Redirect URLs include `https://<domain>/auth/callback` and `http://localhost:3100/auth/callback`.
7. **Storage**: the migration creates the private bucket `career-documents` with per-user folder policies. Confirm it is *not* public.

Verify: sign in → `select * from public.profiles` shows your row; another account cannot read it.

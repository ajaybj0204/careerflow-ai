-- Security hardening (from the Supabase security advisor).
-- 1. Pin search_path on the updated_at trigger function.
alter function public.set_updated_at() set search_path = public;

-- 2. The new-user bootstrap is a trigger function only; nobody should call it through the API.
revoke execute on function public.handle_new_user() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke execute on function public.handle_new_user() from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke execute on function public.handle_new_user() from authenticated'; end if;
end $$;

-- 3. Signed-out visitors (anon) get no table access at all. CareerFlow never uses the anon role for data.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

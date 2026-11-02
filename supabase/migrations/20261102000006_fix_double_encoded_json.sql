-- Repairs jsonb values that were stored as JSON *strings* (double-encoded) by the Postgres driver
-- before the serializer fix. Converts every jsonb string scalar that contains a JSON object or array
-- back into that object/array. Safe to run repeatedly; values that are genuinely strings are left alone.
do $$
declare r record;
begin
  for r in
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and data_type = 'jsonb'
  loop
    execute format(
      $f$update public.%I set %I = (%I #>> '{}')::jsonb
         where jsonb_typeof(%I) = 'string' and left(btrim(%I #>> '{}'), 1) in ('{', '[')$f$,
      r.table_name, r.column_name, r.column_name, r.column_name, r.column_name);
  end loop;
end $$;

-- Import progress counters that were built from a mis-read string (keys "0","1",...) are reset;
-- real totals are recalculated from processed_messages below.
update public.gmail_sync_state s set import_counts = (
  select coalesce(jsonb_object_agg(x.outcome, x.n), '{}'::jsonb) || jsonb_build_object('scanned', coalesce(sum(x.n), 0))
  from (select outcome, count(*)::int as n from public.processed_messages p where p.user_id = s.user_id group by outcome) x)
where import_counts ? '0';

-- Run after applying the TalkTwo launch migration stack and before store submission.
-- Read-only verification: raises an exception if a public FK can block auth.users deletion
-- or if purchase/sponsorship history would be deleted instead of pseudonymized.

do $$
declare
  blocking_fks text;
  wrong_retention_fks text;
begin
  select string_agg(format('%I.%I (%I)', n.nspname, c.relname, con.conname), ', ' order by n.nspname, c.relname, con.conname)
    into blocking_fks
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where con.contype = 'f'
    and con.confrelid = 'auth.users'::regclass
    and n.nspname = 'public'
    and con.confdeltype in ('a', 'r'); -- NO ACTION / RESTRICT

  if blocking_fks is not null then
    raise exception 'Account deletion can be blocked by public auth.users FKs: %', blocking_fks;
  end if;

  with expected(constraint_name, expected_delete) as (
    values
      ('premium_gifts_purchaser_id_fkey', 'n'::"char"),
      ('premium_sponsorship_credits_payer_user_id_fkey', 'n'::"char"),
      ('store_purchase_events_user_id_fkey', 'n'::"char"),
      ('premium_store_subscriptions_payer_user_id_fkey', 'n'::"char"),
      ('premium_store_subscription_members_user_id_fkey', 'c'::"char")
  ), actual as (
    select con.conname as constraint_name, con.confdeltype
    from pg_constraint con
    where con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
  )
  select string_agg(e.constraint_name, ', ' order by e.constraint_name)
    into wrong_retention_fks
  from expected e
  left join actual a using (constraint_name)
  where a.constraint_name is null or a.confdeltype <> e.expected_delete;

  if wrong_retention_fks is not null then
    raise exception 'Account deletion retention FK contract is missing or wrong: %', wrong_retention_fks;
  end if;
end;
$$;

select 'account_deletion_schema_ok' as check_name;

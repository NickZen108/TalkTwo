-- Post-deploy TalkTwo security gate. Read-only: raises if an authenticated
-- SECURITY DEFINER RPC violates the RPC-only trust boundary.
-- Run after all release migrations and before Edge Functions/store release.

do $$
declare
  violations text;
begin
  select pg_catalog.string_agg(
           pg_catalog.format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)),
           E'\n'
           order by p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
         )
    into violations
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
     and (
       pg_catalog.pg_get_functiondef(p.oid) !~* 'auth\.uid\s*\('
       or not exists (
         select 1
           from pg_catalog.unnest(pg_catalog.coalesce(p.proconfig, array[]::text[])) setting
          where setting ~* '^search_path='
       )
       or pg_catalog.has_function_privilege('anon', p.oid, 'execute')
       or pg_catalog.has_function_privilege('public', p.oid, 'execute')
     );

  if violations is not null then
    raise exception 'Unsafe authenticated SECURITY DEFINER RPC(s): %', E'\n' || violations;
  end if;

  if pg_catalog.has_schema_privilege('authenticated', 'public', 'create')
     or pg_catalog.has_schema_privilege('anon', 'public', 'create') then
    raise exception 'Untrusted API roles must not have CREATE privilege on public schema';
  end if;
end
$$;

select 'security_definer_schema_ok' as status;

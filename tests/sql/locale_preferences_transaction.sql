-- Run after the locale preference migration, inside a transaction that is rolled back.

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('70000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'locale@example.invalid', '', now(), now(), now());
insert into public.profiles(id, display_name)
values ('70000000-0000-4000-8000-000000000001', 'Locale Test')
on conflict (id) do update set display_name = excluded.display_name;

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', true);
set local role authenticated;

do $test$
declare preference text;
begin
  select public.get_my_locale_preference() into preference;
  if preference <> 'system' then raise exception 'new profile did not default to system locale'; end if;
  perform public.set_my_locale_preference('da', 'da');
  select public.get_my_locale_preference() into preference;
  if preference <> 'da' then raise exception 'Danish preference was not saved'; end if;

  begin
    perform public.set_my_locale_preference('de', 'en');
    raise exception 'unsupported preference unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%Unsupported locale preference%' then raise; end if;
  end;

  begin
    perform public.set_my_locale_preference('system', 'de');
    raise exception 'unsupported resolved locale unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%Unsupported resolved locale%' then raise; end if;
  end;
end
$test$;

reset role;
do $test$
begin
  if not exists(
    select 1 from public.profiles
    where id = '70000000-0000-4000-8000-000000000001' and locale_preference = 'da' and locale = 'da'
  ) then raise exception 'profile locale columns were not updated together'; end if;
end
$test$;

select 'locale preference migration behavior passed' as result;

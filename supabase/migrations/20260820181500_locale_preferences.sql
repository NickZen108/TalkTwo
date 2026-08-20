alter table public.profiles
  add column if not exists locale_preference text not null default 'system';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_locale_preference_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_locale_preference_check
      check (locale_preference in ('system', 'en', 'da'));
  end if;
end
$$;

create or replace function public.get_my_locale_preference()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.locale_preference from public.profiles p where p.id = (select auth.uid())), 'system');
$$;

create or replace function public.set_my_locale_preference(locale_preference text, resolved_locale text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if locale_preference not in ('system', 'en', 'da') then raise exception 'Unsupported locale preference'; end if;
  if resolved_locale not in ('en', 'da') then raise exception 'Unsupported resolved locale'; end if;
  update public.profiles p
  set locale_preference = set_my_locale_preference.locale_preference,
      locale = resolved_locale,
      updated_at = now()
  where p.id = (select auth.uid());
  if not found then raise exception 'Profile not found'; end if;
  return true;
end
$$;

revoke execute on function public.get_my_locale_preference() from public, anon;
revoke execute on function public.set_my_locale_preference(text, text) from public, anon;
grant execute on function public.get_my_locale_preference() to authenticated, service_role;
grant execute on function public.set_my_locale_preference(text, text) to authenticated, service_role;

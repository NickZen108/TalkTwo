create table public.coach_review_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reviewed_attempts integer not null default 0 check (reviewed_attempts >= 0),
  green_count integer not null default 0 check (green_count >= 0),
  yellow_count integer not null default 0 check (yellow_count >= 0),
  red_count integer not null default 0 check (red_count >= 0),
  updated_at timestamptz not null default now(),
  constraint coach_review_stats_totals_match
    check (reviewed_attempts = green_count + yellow_count + red_count)
);

alter table public.coach_review_stats enable row level security;
revoke all on table public.coach_review_stats from public, anon, authenticated;

create or replace function public.get_my_coach_settings()
returns table(
  enabled boolean,
  premium_active boolean,
  reviewed_attempts integer,
  green_count integer,
  yellow_count integer,
  red_count integer,
  blocked_percentage numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  is_enabled boolean;
  has_premium boolean := false;
  stats public.coach_review_stats;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select p.coach_enabled
  into is_enabled
  from public.profiles p
  where p.id = uid;

  if not found then raise exception 'Profile not found'; end if;

  select exists(
    select 1
    from public.user_plans p
    where p.user_id = uid
      and (
        (p.plan = 'trial' and p.trial_ends_at is not null and p.trial_ends_at > now())
        or (p.plan = 'premium' and (p.premium_ends_at is null or p.premium_ends_at > now()))
      )
  ) into has_premium;

  select s.*
  into stats
  from public.coach_review_stats s
  where s.user_id = uid;

  return query
  select
    coalesce(is_enabled, false),
    has_premium,
    coalesce(stats.reviewed_attempts, 0),
    coalesce(stats.green_count, 0),
    coalesce(stats.yellow_count, 0),
    coalesce(stats.red_count, 0),
    case
      when coalesce(stats.reviewed_attempts, 0) = 0 then 0::numeric
      else round((coalesce(stats.red_count, 0)::numeric * 100) / stats.reviewed_attempts, 1)
    end;
end;
$$;

create or replace function public.set_my_coach_enabled(enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  premium_active boolean := false;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  if enabled then
    select exists(
      select 1
      from public.user_plans p
      where p.user_id = uid
        and (
          (p.plan = 'trial' and p.trial_ends_at is not null and p.trial_ends_at > now())
          or (p.plan = 'premium' and (p.premium_ends_at is null or p.premium_ends_at > now()))
        )
    ) into premium_active;

    if not premium_active then raise exception 'Premium is required for Coach'; end if;
  end if;

  update public.profiles p
  set coach_enabled = enabled,
      updated_at = now()
  where p.id = uid;

  if not found then raise exception 'Profile not found'; end if;
  return enabled;
end;
$$;

create or replace function public.record_coach_review_outcome(target_user uuid, outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_user is null then raise exception 'User is required'; end if;
  if outcome not in ('green', 'yellow', 'red') then raise exception 'Invalid review outcome'; end if;

  insert into public.coach_review_stats(
    user_id,
    reviewed_attempts,
    green_count,
    yellow_count,
    red_count
  )
  values(
    target_user,
    1,
    case when outcome = 'green' then 1 else 0 end,
    case when outcome = 'yellow' then 1 else 0 end,
    case when outcome = 'red' then 1 else 0 end
  )
  on conflict (user_id) do update set
    reviewed_attempts = public.coach_review_stats.reviewed_attempts + 1,
    green_count = public.coach_review_stats.green_count + case when outcome = 'green' then 1 else 0 end,
    yellow_count = public.coach_review_stats.yellow_count + case when outcome = 'yellow' then 1 else 0 end,
    red_count = public.coach_review_stats.red_count + case when outcome = 'red' then 1 else 0 end,
    updated_at = now();
end;
$$;

revoke execute on function public.get_my_coach_settings() from public, anon;
revoke execute on function public.set_my_coach_enabled(boolean) from public, anon;
revoke execute on function public.record_coach_review_outcome(uuid, text) from public, anon, authenticated;

grant execute on function public.get_my_coach_settings() to authenticated, service_role;
grant execute on function public.set_my_coach_enabled(boolean) to authenticated, service_role;
grant execute on function public.record_coach_review_outcome(uuid, text) to service_role;

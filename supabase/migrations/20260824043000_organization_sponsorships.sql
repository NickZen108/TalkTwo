create table public.organization_sponsorships (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null check (char_length(trim(organization_name)) between 2 and 120),
  recipient_email_hash text check (recipient_email_hash ~ '^[0-9a-f]{64}$'),
  duration_months smallint not null check (duration_months between 1 and 24),
  status text not null default 'pending' check (status in ('pending', 'claimed', 'revoked', 'expired')),
  claim_expires_at timestamptz not null default (now() + interval '180 days'),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  premium_ends_at timestamptz,
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'claimed') = (claimed_at is not null and premium_ends_at is not null)),
  constraint organization_sponsorship_recipient_match_lifecycle check (
    (status = 'pending' and recipient_email_hash is not null)
    or (status <> 'pending' and recipient_email_hash is null)
  )
);

create index organization_sponsorships_pending_email_hash_idx
  on public.organization_sponsorships(recipient_email_hash, claim_expires_at)
  where status = 'pending';

alter table public.organization_sponsorships enable row level security;
revoke all on table public.organization_sponsorships from public, anon, authenticated;
grant select, insert, update on table public.organization_sponsorships to service_role;

create or replace function public.create_organization_sponsorship(
  sponsor_name text,
  recipient text,
  sponsored_months integer,
  expires_at timestamptz default (now() + interval '180 days'),
  reference text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(coalesce(recipient, '')));
  normalized_name text := trim(coalesce(sponsor_name, ''));
  email_hash text;
  created_id uuid;
begin
  if char_length(normalized_name) < 2 or char_length(normalized_name) > 120 then
    raise exception 'Organization name must contain 2 to 120 characters';
  end if;
  if char_length(normalized_email) < 3
     or char_length(normalized_email) > 320
     or normalized_email not like '%@%' then
    raise exception 'Valid recipient email required';
  end if;
  if sponsored_months < 1 or sponsored_months > 24 then
    raise exception 'Sponsorship must cover 1 to 24 months';
  end if;
  if expires_at is null or expires_at <= now() then
    raise exception 'Claim expiry must be in the future';
  end if;

  email_hash := pg_catalog.encode(extensions.digest(normalized_email, 'sha256'), 'hex');

  insert into public.organization_sponsorships(
    organization_name,
    recipient_email_hash,
    duration_months,
    claim_expires_at,
    external_reference
  ) values (
    normalized_name,
    email_hash,
    sponsored_months::smallint,
    expires_at,
    nullif(trim(reference), '')
  )
  returning id into created_id;

  return created_id;
end;
$$;

create or replace function public.claim_my_organization_sponsorships()
returns table(
  sponsorship_id uuid,
  sponsor_name text,
  sponsored_months integer,
  entitlement_ends_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  verified_email text;
  verified_email_hash text;
  plan_row public.user_plans%rowtype;
  sponsorship public.organization_sponsorships%rowtype;
  entitlement_base timestamptz;
  entitlement_end timestamptz;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select lower(u.email)
    into verified_email
    from auth.users u
   where u.id = uid
     and u.email_confirmed_at is not null;

  if verified_email is null then raise exception 'Verified email required'; end if;
  verified_email_hash := pg_catalog.encode(extensions.digest(verified_email, 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('talktwo:org-sponsor:' || uid::text, 0)
  );

  update public.organization_sponsorships s
     set status = 'expired',
         recipient_email_hash = null,
         updated_at = now()
   where s.recipient_email_hash = verified_email_hash
     and s.status = 'pending'
     and s.claim_expires_at <= now();

  insert into public.user_plans(user_id)
  values(uid)
  on conflict(user_id) do nothing;

  select *
    into plan_row
    from public.user_plans p
   where p.user_id = uid
   for update;

  for sponsorship in
    select s.*
      from public.organization_sponsorships s
     where s.recipient_email_hash = verified_email_hash
       and s.status = 'pending'
       and s.claim_expires_at > now()
     order by s.created_at, s.id
     for update
  loop
    entitlement_base := greatest(
      now(),
      coalesce(plan_row.premium_ends_at, '-infinity'::timestamptz),
      coalesce(plan_row.trial_ends_at, '-infinity'::timestamptz)
    );
    entitlement_end := entitlement_base
      + pg_catalog.make_interval(months => sponsorship.duration_months);

    update public.user_plans p
       set plan = 'premium',
           premium_ends_at = entitlement_end,
           sponsored_by = null,
           updated_at = now()
     where p.user_id = uid;

    update public.organization_sponsorships s
       set status = 'claimed',
           recipient_email_hash = null,
           claimed_by = uid,
           claimed_at = now(),
           premium_ends_at = entitlement_end,
           updated_at = now()
     where s.id = sponsorship.id
       and s.status = 'pending';

    plan_row.plan := 'premium';
    plan_row.premium_ends_at := entitlement_end;

    sponsorship_id := sponsorship.id;
    sponsor_name := sponsorship.organization_name;
    sponsored_months := sponsorship.duration_months;
    entitlement_ends_at := entitlement_end;
    return next;
  end loop;
end;
$$;

revoke execute on function public.create_organization_sponsorship(text, text, integer, timestamptz, text)
  from public, anon, authenticated;
revoke execute on function public.claim_my_organization_sponsorships()
  from public, anon;

grant execute on function public.create_organization_sponsorship(text, text, integer, timestamptz, text)
  to service_role;
grant execute on function public.claim_my_organization_sponsorships()
  to authenticated, service_role;

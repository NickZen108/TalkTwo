-- Privacy-first chat controls: no partner timezone exposure, no read/rejection
-- side channels to senders, universal symbolic-tone blocking, neutral public
-- names, time-limited owner-only blocks, and owner-only notification mutes.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.relationship_blocks add column if not exists expires_at timestamptz;
create index if not exists relationship_blocks_active_lookup_idx
  on public.relationship_blocks(relationship_id, blocker_id, blocked_user_id, expires_at);

create or replace function public.symbolic_tone_block_reason(message_body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare clean text := coalesce(message_body, '');
begin
  if clean = '' then return null; end if;
  if clean ~ '[😀-🙏🌀-🫿☀-➿]' or clean ~ '[🇦-🇿]'
     or position(chr(65039) in clean) > 0 or position(chr(8419) in clean) > 0 then
    return 'Emoji are not allowed. Use words if you want to express a feeling.';
  end if;
  if clean ~ '([:;=8xX][-^'']?[()DPp/|]|<3|\^_\^|-_-)' then
    return 'Emoticons are not allowed. Use words if you want to express a feeling.';
  end if;
  return null;
end;
$$;

create or replace function private.enforce_message_privacy_invariants()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare reason text;
begin
  if new.body is not null then
    reason := public.symbolic_tone_block_reason(new.body);
    if reason is not null then raise exception '%', reason; end if;
  end if;

  if tg_op = 'INSERT' then
    new.blocked_for_recipient := exists(
      select 1 from public.relationship_blocks b
      where b.relationship_id = new.relationship_id
        and b.blocker_id = new.recipient_id
        and b.blocked_user_id = new.sender_id
        and (b.expires_at is null or b.expires_at > now())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_message_privacy_invariants on public.messages;
create trigger enforce_message_privacy_invariants
before insert or update of body on public.messages
for each row execute function private.enforce_message_privacy_invariants();

create or replace function public.safe_public_display_name(candidate text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare clean text := regexp_replace(trim(coalesce(candidate,'')), '[[:space:]]+', ' ', 'g');
declare lowered text;
begin
  if clean = '' or char_length(clean) > 50 then return 'Member'; end if;
  if public.symbolic_tone_block_reason(clean) is not null then return 'Member'; end if;
  lowered := lower(clean);
  if lowered ~ '(^|[^[:alpha:]])(hader|hate|hates|idiot|moron|stupid|crazy|insane|psycho|psychopath|bitch|asshole|cunt|røvhul|kælling|sindssyg|psykopat|narcissist|narcissistisk|dum|doven|egoist)([^[:alpha:]]|$)' then
    return 'Member';
  end if;
  return clean;
end;
$$;

create or replace function public.set_my_display_name(candidate text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
declare clean text := regexp_replace(trim(coalesce(candidate,'')), '[[:space:]]+', ' ', 'g');
declare safe text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  safe := public.safe_public_display_name(clean);
  if safe = 'Member' and lower(clean) <> 'member' then
    raise exception 'Use a neutral name. Insults, hostile labels, emoji and emoticons are not allowed in public names.';
  end if;
  update public.profiles set display_name = safe, updated_at = now() where id = uid;
  return safe;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, locale, timezone)
  values (
    new.id,
    public.safe_public_display_name(new.raw_user_meta_data->>'display_name'),
    coalesce(new.raw_user_meta_data->>'locale', 'en'),
    coalesce(new.raw_user_meta_data->>'timezone', 'UTC')
  );
  insert into public.user_plans (user_id) values (new.id);
  return new;
end;
$$;

create or replace function public.list_relationship_members(rel_id uuid)
returns table(user_id uuid, display_name text, role text, joined_at timestamptz, blocked_by_me boolean, is_extra boolean, subscription_status text, current_period_end timestamptz, renewal_approved_by_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select rm.user_id,
         public.safe_public_display_name(p.display_name) as display_name,
         rm.role,
         rm.joined_at,
         exists(
           select 1 from public.relationship_blocks b
           where b.relationship_id=rel_id and b.blocker_id=(select auth.uid()) and b.blocked_user_id=rm.user_id
             and (b.expires_at is null or b.expires_at>now())
         ),
         (s.id is not null) as is_extra,
         s.status,
         s.current_period_end,
         case when s.id is null then null else (
           select a.decision from public.member_invitation_approvals a
           where a.invitation_id=s.invitation_id and a.approver_id=(select auth.uid())
         ) end
  from public.relationship_members rm
  join public.profiles p on p.id=rm.user_id
  left join public.relationship_member_subscriptions s
    on s.relationship_id=rm.relationship_id and s.member_user_id=rm.user_id and s.status in ('active','cancel_at_period_end')
  where rm.relationship_id=rel_id
    and exists(select 1 from public.relationship_members me where me.relationship_id=rel_id and me.user_id=(select auth.uid()))
    and (s.id is null or s.current_period_end>now())
  order by rm.joined_at,rm.user_id;
$$;

create or replace function public.list_pending_member_approvals(rel_id uuid)
returns table(invitation_id uuid, candidate_id uuid, display_name text, role text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,i.candidate_id,public.safe_public_display_name(p.display_name),i.role,i.status,i.created_at
  from public.member_invitations i
  join public.member_invitation_approvals a on a.invitation_id=i.id and a.approver_id=(select auth.uid()) and a.decision is null
  join public.profiles p on p.id=i.candidate_id
  where i.relationship_id=rel_id and i.status='awaiting_approvals' and i.expires_at>now()
  order by i.created_at;
$$;

drop function if exists public.set_member_block(uuid, uuid, boolean);
create function public.set_member_block(rel_id uuid, target_user uuid, blocked boolean, block_minutes integer default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
declare block_until timestamptz;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if target_user=uid then raise exception 'You cannot block yourself'; end if;
  if not exists(select 1 from public.relationship_members where relationship_id=rel_id and user_id=uid) then raise exception 'Not a relationship member'; end if;
  if not exists(select 1 from public.relationship_members where relationship_id=rel_id and user_id=target_user) then raise exception 'Target is not a relationship member'; end if;

  if blocked then
    if block_minutes is not null and block_minutes not in (60,240,1440) then
      raise exception 'Block duration must be 1 hour, 4 hours, 24 hours, or indefinite';
    end if;
    block_until := case when block_minutes is null then null else now() + make_interval(mins => block_minutes) end;
    insert into public.relationship_blocks(relationship_id,blocker_id,blocked_user_id,blocked_at,expires_at)
      values(rel_id,uid,target_user,now(),block_until)
      on conflict(relationship_id,blocker_id,blocked_user_id)
      do update set blocked_at=now(), expires_at=excluded.expires_at;
    update public.messages set blocked_for_recipient=true
      where relationship_id=rel_id and recipient_id=uid and sender_id=target_user
        and opened_at is null and rejected_at is null and withdrawn_at is null;
  else
    delete from public.relationship_blocks
    where relationship_id=rel_id and blocker_id=uid and blocked_user_id=target_user;
  end if;
  return blocked;
end;
$$;

create or replace function public.list_my_member_blocks(rel_id uuid)
returns table(blocked_user_id uuid, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_user_id,b.expires_at
  from public.relationship_blocks b
  where b.relationship_id=rel_id and b.blocker_id=(select auth.uid())
    and (b.expires_at is null or b.expires_at>now())
    and exists(select 1 from public.relationship_members me where me.relationship_id=rel_id and me.user_id=(select auth.uid()));
$$;

-- Keep the existing return shape for client compatibility, but remove every
-- rejection/open side-channel from rows representing messages sent by the caller.
create or replace function public.list_relationship_messages(rel_id uuid)
returns table(id uuid, logical_id uuid, relationship_id uuid, sender_id uuid, recipient_id uuid, body text, body_hash text, ciphertext text, risk_level text, created_at timestamptz, available_at timestamptz, opened_at timestamptz, withdrawn_at timestamptz, edited_at timestamptz, rejected_at timestamptz, reject_reason text, blocked_for_recipient boolean, recipient_count integer, rejected_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select m.logical_id as id,m.logical_id,m.relationship_id,m.sender_id,null::uuid as recipient_id,
      max(m.body) as body,max(m.body_hash) as body_hash,max(m.ciphertext) as ciphertext,max(m.risk_level) as risk_level,
      min(m.created_at) as created_at,min(m.created_at) as available_at,null::timestamptz as opened_at,
      max(m.withdrawn_at) as withdrawn_at,max(m.edited_at) as edited_at,null::timestamptz as rejected_at,
      null::text as reject_reason,false as blocked_for_recipient,count(*)::int as recipient_count,0::int as rejected_count
    from public.messages m
    where m.relationship_id=rel_id and m.sender_id=(select auth.uid())
    group by m.logical_id,m.relationship_id,m.sender_id
  ), incoming as (
    select m.id,m.logical_id,m.relationship_id,m.sender_id,m.recipient_id,
      case when m.blocked_for_recipient or m.opened_at is null then null else m.body end as body,
      m.body_hash,
      case when m.blocked_for_recipient or m.opened_at is null then null else m.ciphertext end as ciphertext,
      m.risk_level,m.created_at,m.available_at,m.opened_at,m.withdrawn_at,m.edited_at,m.rejected_at,m.reject_reason,
      m.blocked_for_recipient,1::int as recipient_count,0::int as rejected_count
    from public.messages m
    where m.relationship_id=rel_id and m.recipient_id=(select auth.uid()) and m.available_at<=now()
      and m.withdrawn_at is null and m.rejected_at is null
  )
  select * from mine
  union all
  select * from incoming
  order by created_at,id;
$$;

-- Partner timezones and exact window schedules are internal routing data, not
-- participant-visible social metadata.
revoke execute on function public.get_relationship_partner_settings(uuid) from authenticated;
grant execute on function public.get_relationship_partner_settings(uuid) to service_role;

create table if not exists public.notification_mutes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  relationship_id uuid references public.relationships(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (relationship_id is null and sender_id is null)
    or (relationship_id is not null and sender_id is null)
    or (relationship_id is null and sender_id is not null)
  ),
  check (sender_id is null or sender_id <> user_id)
);

create unique index if not exists notification_mutes_global_uidx
  on public.notification_mutes(user_id) where relationship_id is null and sender_id is null;
create unique index if not exists notification_mutes_relationship_uidx
  on public.notification_mutes(user_id,relationship_id) where relationship_id is not null;
create unique index if not exists notification_mutes_sender_uidx
  on public.notification_mutes(user_id,sender_id) where sender_id is not null;

alter table public.notification_mutes enable row level security;
revoke all on table public.notification_mutes from public,anon,authenticated;
grant select,insert,update,delete on table public.notification_mutes to service_role;

create or replace function public.list_my_notification_mutes(rel_id uuid default null)
returns table(relationship_id uuid, sender_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.relationship_id,m.sender_id,m.created_at
  from public.notification_mutes m
  where m.user_id=(select auth.uid())
    and (rel_id is null or m.relationship_id=rel_id or m.relationship_id is null)
  order by m.created_at;
$$;

create or replace function public.set_my_notification_mute(rel_id uuid default null, target_sender uuid default null, muted boolean default true)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if rel_id is not null and target_sender is not null then raise exception 'Choose either a chat or a person'; end if;
  if rel_id is not null and not exists(
    select 1 from public.relationship_members rm where rm.relationship_id=rel_id and rm.user_id=uid
  ) then raise exception 'Not a relationship member'; end if;

  if target_sender is not null then
    if target_sender=uid then raise exception 'You cannot mute yourself'; end if;
    if not exists(
      select 1
      from public.relationship_members me
      join public.relationship_members other on other.relationship_id=me.relationship_id
      where me.user_id=uid and other.user_id=target_sender
    ) then raise exception 'This person does not share a TalkTwo chat with you'; end if;
  end if;

  delete from public.notification_mutes m
  where m.user_id=uid
    and m.relationship_id is not distinct from rel_id
    and m.sender_id is not distinct from target_sender;

  if muted then
    insert into public.notification_mutes(user_id,relationship_id,sender_id)
    values(uid,rel_id,target_sender);

    -- Turning notifications off must cancel already-queued private alerts too.
    if to_regclass('public.push_notification_jobs') is not null then
      execute 'update public.push_notification_jobs j set status=''cancelled'', updated_at=now(), last_error=''Notifications muted by recipient'' from public.messages msg where j.message_id=msg.id and j.user_id=$1 and j.status in (''pending'',''processing'',''ticketed'') and ($2::uuid is null or msg.relationship_id=$2) and ($3::uuid is null or msg.sender_id=$3)'
        using uid, rel_id, target_sender;
    end if;
  end if;
  return muted;
end;
$$;

revoke execute on function public.set_my_display_name(text) from public,anon;
revoke execute on function public.set_member_block(uuid,uuid,boolean,integer) from public,anon;
revoke execute on function public.list_my_member_blocks(uuid) from public,anon;
revoke execute on function public.list_my_notification_mutes(uuid) from public,anon;
revoke execute on function public.set_my_notification_mute(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_my_display_name(text) to authenticated,service_role;
grant execute on function public.set_member_block(uuid,uuid,boolean,integer) to authenticated,service_role;
grant execute on function public.list_my_member_blocks(uuid) to authenticated,service_role;
grant execute on function public.list_my_notification_mutes(uuid) to authenticated,service_role;
grant execute on function public.set_my_notification_mute(uuid,uuid,boolean) to authenticated,service_role;

-- When the earlier push migration is present, future jobs honor global/chat/person mutes.
do $$
begin
  if to_regclass('public.push_notification_jobs') is not null
     and to_regclass('public.push_devices') is not null then
    execute $ddl$
      create or replace function private.queue_message_push()
      returns trigger
      language plpgsql
      security invoker
      set search_path = ''
      as $fn$
      begin
        if new.blocked_for_recipient then return new; end if;
        if exists(
          select 1 from public.notification_mutes m
          where m.user_id=new.recipient_id
            and (
              (m.relationship_id is null and m.sender_id is null)
              or m.relationship_id=new.relationship_id
              or m.sender_id=new.sender_id
            )
        ) then return new; end if;
        insert into public.push_notification_jobs(message_id,device_id,user_id,available_at,next_attempt_at)
        select new.id,d.id,new.recipient_id,new.available_at,new.available_at
        from public.push_devices d
        where d.user_id=new.recipient_id and d.enabled
        on conflict(message_id,device_id) do nothing;
        return new;
      end
      $fn$
    $ddl$;
  end if;
end
$$;
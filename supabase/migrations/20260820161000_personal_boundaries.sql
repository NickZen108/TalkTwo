-- Premium Personal Boundaries are private per-chat settings. Clients manage them
-- through narrow RPCs; the table itself is never exposed to client roles.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function public.normalize_personal_boundary(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(
    lower(regexp_replace(normalize(trim(coalesce(value, '')), NFKC), '[^[:alnum:]]+', ' ', 'g')),
    '[[:space:]]+', ' ', 'g'
  ));
$$;

create or replace function public.personal_boundary_rejection_reason(value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  display_value text := regexp_replace(trim(coalesce(value, '')), '[[:space:]]+', ' ', 'g');
  normalized_value text := public.normalize_personal_boundary(value);
  word_count integer;
begin
  if display_value = '' then return 'Enter a word or short phrase.'; end if;
  if char_length(display_value) > 40 then return 'Use at most 40 characters.'; end if;
  if char_length(normalized_value) < 2 then return 'Use at least two letters or numbers.'; end if;
  word_count := cardinality(regexp_split_to_array(normalized_value, ' '));
  if word_count > 5 then return 'Use at most five words.'; end if;
  if normalized_value = any(array[
    'address', 'adresse', 'aflevering', 'akut', 'barn', 'børn', 'child', 'children',
    'doctor', 'dropoff', 'emergency', 'hospital', 'læge', 'medication', 'medicine',
    'medicin', 'nødsituation', 'phone', 'pickup', 'school', 'skole', 'telefon', 'urgent'
  ]::text[]) then
    return 'This essential logistics word cannot be blocked on its own.';
  end if;
  return null;
end;
$$;

alter table public.personal_boundaries add column if not exists normalized_phrase text;
update public.personal_boundaries
set normalized_phrase = public.normalize_personal_boundary(word)
where normalized_phrase is null;
alter table public.personal_boundaries alter column normalized_phrase set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'personal_boundaries_word_length'
      and conrelid = 'public.personal_boundaries'::regclass
  ) then
    alter table public.personal_boundaries
      add constraint personal_boundaries_word_length check (char_length(word) between 2 and 40);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'personal_boundaries_normalized'
      and conrelid = 'public.personal_boundaries'::regclass
  ) then
    alter table public.personal_boundaries
      add constraint personal_boundaries_normalized check (normalized_phrase = public.normalize_personal_boundary(word));
  end if;
end;
$$;

create unique index if not exists personal_boundaries_user_relationship_normalized_idx
  on public.personal_boundaries(user_id, relationship_id, normalized_phrase);

comment on table public.personal_boundaries is 'Premium-only recipient words and phrases enforced during message creation and editing.';
alter table public.personal_boundaries enable row level security;
revoke all on table public.personal_boundaries from public, anon, authenticated;
grant select, insert, update, delete on table public.personal_boundaries to service_role;

create or replace function public.list_my_personal_boundaries(rel_id uuid)
returns table(id uuid, phrase text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Authentication required'; end if;
  return query
    select pb.id, pb.word, pb.created_at
    from public.personal_boundaries pb
    where pb.user_id = uid and pb.relationship_id = rel_id
    order by pb.created_at, pb.id;
end;
$$;

create or replace function public.add_my_personal_boundary(rel_id uuid, p_phrase text)
returns table(id uuid, phrase text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  display_value text := regexp_replace(trim(coalesce(p_phrase, '')), '[[:space:]]+', ' ', 'g');
  normalized_value text := public.normalize_personal_boundary(p_phrase);
  rejection text := public.personal_boundary_rejection_reason(p_phrase);
  plan_row public.user_plans;
  boundary_count integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if rejection is not null then raise exception '%', rejection; end if;
  if not exists (
    select 1 from public.relationship_members rm
    where rm.relationship_id = rel_id and rm.user_id = uid
  ) then
    raise exception 'Not a relationship member';
  end if;

  select up.* into plan_row
  from public.user_plans up
  where up.user_id = uid
  for update;
  if not found then raise exception 'Plan not found'; end if;
  if not (
    (plan_row.plan = 'trial' and plan_row.trial_ends_at > now()) or
    (plan_row.plan = 'premium' and (plan_row.premium_ends_at is null or plan_row.premium_ends_at > now()))
  ) then
    raise exception 'Premium or an active trial is required to add Personal Boundaries';
  end if;

  select count(*)::integer into boundary_count
  from public.personal_boundaries pb
  where pb.user_id = uid and pb.relationship_id = rel_id;
  if boundary_count >= 10 then raise exception 'You can add at most 10 Personal Boundaries in one chat'; end if;

  return query
    insert into public.personal_boundaries(user_id, relationship_id, word, normalized_phrase)
    values(uid, rel_id, display_value, normalized_value)
    returning personal_boundaries.id, personal_boundaries.word, personal_boundaries.created_at;
exception
  when unique_violation then raise exception 'This Personal Boundary is already in your list';
end;
$$;

create or replace function public.remove_my_personal_boundary(boundary_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  changed integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  delete from public.personal_boundaries pb where pb.id = boundary_id and pb.user_id = uid;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function private.matching_personal_boundary(target_user uuid, target_relationship uuid, message_body text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select pb.word
  from public.personal_boundaries pb
  join public.user_plans up on up.user_id = pb.user_id
  where pb.user_id = target_user
    and pb.relationship_id = target_relationship
    and (
      (up.plan = 'trial' and up.trial_ends_at > now()) or
      (up.plan = 'premium' and (up.premium_ends_at is null or up.premium_ends_at > now()))
    )
    and strpos(
      ' ' || public.normalize_personal_boundary(message_body) || ' ',
      ' ' || pb.normalized_phrase || ' '
    ) > 0
  order by char_length(pb.normalized_phrase) desc, pb.created_at
  limit 1;
$$;

create or replace function public.send_message(rel_id uuid, message_body text, encrypted_body text)
returns table(id uuid, logical_id uuid, relationship_id uuid, sender_id uuid, recipient_id uuid, body text, body_hash text, ciphertext text, risk_level text, created_at timestamptz, available_at timestamptz, opened_at timestamptz, withdrawn_at timestamptz, edited_at timestamptz, rejected_at timestamptz, reject_reason text, blocked_for_recipient boolean, recipient_count integer, rejected_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  my_role text;
  rel_status text;
  msg text := trim(coalesce(message_body, ''));
  h text;
  logical uuid := gen_random_uuid();
  review public.ai_message_reviews;
  risk text := 'green';
  block_reason text;
  plan_name text;
  trial_end timestamptz;
  premium_end timestamptz;
  premium_active boolean := false;
  matched_boundary text;
  rec record;
  cnt integer := 0;
  created timestamptz := now();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if msg = '' then raise exception 'Message cannot be empty'; end if;
  if encrypted_body is null or encrypted_body = '' or char_length(encrypted_body) > 4096 then raise exception 'Encrypted message payload is required'; end if;
  select rm.role into my_role from public.relationship_members rm where rm.relationship_id = rel_id and rm.user_id = uid;
  if my_role is null then raise exception 'Not a relationship member'; end if;
  if my_role <> 'participant' then raise exception 'Observers cannot send messages'; end if;
  select r.status into rel_status from public.relationships r where r.id = rel_id;
  if rel_status is distinct from 'active' then raise exception 'This connection is not active'; end if;
  h := encode(extensions.digest(msg, 'sha256'), 'hex');
  select up.plan, up.trial_ends_at, up.premium_ends_at into plan_name, trial_end, premium_end from public.user_plans up where up.user_id = uid;
  premium_active := (plan_name = 'trial' and trial_end > now()) or (plan_name = 'premium' and (premium_end is null or premium_end > now()));
  if premium_active then
    select * into review from public.ai_message_reviews r
      where r.user_id = uid and r.relationship_id = rel_id and r.body_hash = h and r.can_send = true
        and r.risk_level in ('green', 'yellow') and r.used_at is null and r.expires_at > now()
      order by r.created_at desc limit 1 for update;
  end if;
  if review.id is not null then
    if char_length(msg) > 480 then raise exception 'Premium messages are limited to 480 characters'; end if;
    risk := review.risk_level;
  else
    block_reason := public.free_message_block_reason(msg);
    if block_reason is not null then raise exception '%', block_reason; end if;
  end if;
  for rec in
    select rm.user_id,
      exists(select 1 from public.relationship_blocks b where b.relationship_id = rel_id and b.blocker_id = rm.user_id and b.blocked_user_id = uid) as is_blocked
    from public.relationship_members rm where rm.relationship_id = rel_id and rm.user_id <> uid
  loop
    if not rec.is_blocked then
      matched_boundary := private.matching_personal_boundary(rec.user_id, rel_id, msg);
      if matched_boundary is not null then
        raise exception 'Message contains a recipient''s blocked word or phrase: "%"', matched_boundary;
      end if;
    end if;
    insert into public.messages(logical_id, relationship_id, sender_id, recipient_id, body, body_hash, ciphertext, risk_level, blocked_for_recipient, created_at, available_at)
      values(logical, rel_id, uid, rec.user_id, msg, h, encrypted_body, risk, rec.is_blocked, created, public.next_message_available_at(rec.user_id, created));
    cnt := cnt + 1;
  end loop;
  if cnt = 0 then raise exception 'The other person has not joined yet'; end if;
  if review.id is not null then update public.ai_message_reviews set used_at = now() where ai_message_reviews.id = review.id; end if;
  return query select logical, logical, rel_id, uid, null::uuid, msg, h, encrypted_body, risk, created, created, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::text, false, cnt, 0;
end;
$$;

create or replace function public.edit_unopened_message(message_id uuid, new_body text, encrypted_body text)
returns table(id uuid, logical_id uuid, relationship_id uuid, sender_id uuid, recipient_id uuid, body text, body_hash text, ciphertext text, risk_level text, created_at timestamptz, available_at timestamptz, opened_at timestamptz, withdrawn_at timestamptz, edited_at timestamptz, rejected_at timestamptz, reject_reason text, blocked_for_recipient boolean, recipient_count integer, rejected_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  msg text := trim(coalesce(new_body, ''));
  rel uuid;
  h text;
  review public.ai_message_reviews;
  risk text := 'green';
  block_reason text;
  plan_name text;
  trial_end timestamptz;
  premium_end timestamptz;
  premium_active boolean := false;
  matched_boundary text;
  rec record;
  cnt integer;
  created timestamptz;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if msg = '' then raise exception 'Message cannot be empty'; end if;
  if encrypted_body is null or encrypted_body = '' or char_length(encrypted_body) > 4096 then raise exception 'Encrypted message payload is required'; end if;
  select min(pm.relationship_id), min(pm.created_at), count(*)::integer into rel, created, cnt from public.messages pm where pm.logical_id = message_id and pm.sender_id = uid;
  if rel is null then raise exception 'Message can no longer be edited'; end if;
  if exists(select 1 from public.messages pm where pm.logical_id = message_id and pm.sender_id = uid and (pm.opened_at is not null or pm.rejected_at is not null or pm.withdrawn_at is not null)) then raise exception 'Message can no longer be edited'; end if;
  h := encode(extensions.digest(msg, 'sha256'), 'hex');
  select up.plan, up.trial_ends_at, up.premium_ends_at into plan_name, trial_end, premium_end from public.user_plans up where up.user_id = uid;
  premium_active := (plan_name = 'trial' and trial_end > now()) or (plan_name = 'premium' and (premium_end is null or premium_end > now()));
  if premium_active then
    select * into review from public.ai_message_reviews r where r.user_id = uid and r.relationship_id = rel and r.body_hash = h and r.can_send = true
      and r.risk_level in ('green', 'yellow') and r.used_at is null and r.expires_at > now() order by r.created_at desc limit 1 for update;
  end if;
  if review.id is not null then
    if char_length(msg) > 480 then raise exception 'Premium messages are limited to 480 characters'; end if;
    risk := review.risk_level;
  else
    block_reason := public.free_message_block_reason(msg);
    if block_reason is not null then raise exception '%', block_reason; end if;
  end if;
  for rec in
    select distinct pm.recipient_id
    from public.messages pm
    where pm.logical_id = message_id and pm.sender_id = uid and not pm.blocked_for_recipient
  loop
    matched_boundary := private.matching_personal_boundary(rec.recipient_id, rel, msg);
    if matched_boundary is not null then
      raise exception 'Message contains a recipient''s blocked word or phrase: "%"', matched_boundary;
    end if;
  end loop;
  update public.messages pm set body = msg, body_hash = h, ciphertext = encrypted_body, risk_level = risk, edited_at = now(), sender_cached_at = null, plaintext_scrubbed_at = null
    where pm.logical_id = message_id and pm.sender_id = uid;
  if review.id is not null then update public.ai_message_reviews r set used_at = now() where r.id = review.id; end if;
  return query select message_id, message_id, rel, uid, null::uuid, msg, h, encrypted_body, risk, created, created, null::timestamptz, null::timestamptz, now(), null::timestamptz, null::text, false, cnt, 0;
end;
$$;

revoke execute on function public.normalize_personal_boundary(text) from public, anon, authenticated, service_role;
revoke execute on function public.personal_boundary_rejection_reason(text) from public, anon, authenticated, service_role;
revoke execute on function private.matching_personal_boundary(uuid, uuid, text) from public, anon, authenticated, service_role;

revoke execute on function public.list_my_personal_boundaries(uuid) from public, anon;
revoke execute on function public.add_my_personal_boundary(uuid, text) from public, anon;
revoke execute on function public.remove_my_personal_boundary(uuid) from public, anon;
grant execute on function public.list_my_personal_boundaries(uuid) to authenticated, service_role;
grant execute on function public.add_my_personal_boundary(uuid, text) to authenticated, service_role;
grant execute on function public.remove_my_personal_boundary(uuid) to authenticated, service_role;

revoke execute on function public.send_message(uuid, text, text) from public, anon;
revoke execute on function public.edit_unopened_message(uuid, text, text) from public, anon;
grant execute on function public.send_message(uuid, text, text) to authenticated, service_role;
grant execute on function public.edit_unopened_message(uuid, text, text) to authenticated, service_role;

-- Final storage-level Personal Boundary enforcement and plaintext-retention boundary.
-- Earlier message/document RPCs predate timed blocks and can therefore see an
-- expired relationship_blocks row before the later privacy trigger normalizes
-- blocked_for_recipient. Enforce the boundary again at the actual INSERT so an
-- expired block can never bypass the recipient's active Personal Boundaries.
--
-- The send RPC still receives plaintext transiently because TalkTwo must apply
-- deterministic tone rules, approved-AI hashes and each recipient's private
-- Personal Boundaries. After those authoritative checks complete, plaintext is
-- removed from NEW before PostgreSQL persists the message tuple. The messages
-- table therefore retains ciphertext + hash/metadata, not conversation plaintext,
-- for newly inserted rows. This is stronger at-rest minimization, not a claim of
-- zero-knowledge or end-to-end encryption: the trusted send boundary still
-- processes plaintext while deciding whether the message may be routed.
--
-- Personal Boundary phrases are private recipient configuration. Older send RPCs
-- include the return value of matching_personal_boundary() in their exception
-- copy, so replace the helper at the final migration boundary with a presence-only
-- marker. Existing callers still get a non-null signal, but can no longer learn
-- which private word or phrase matched.
create or replace function private.matching_personal_boundary(
  target_user uuid,
  target_relationship uuid,
  message_body text
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select 'private Personal Boundary'::text
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
  limit 1;
$$;

create or replace function private.enforce_message_privacy_invariants()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reason text;
  boundary_match text;
begin
  if new.body is not null then
    reason := public.symbolic_tone_block_reason(new.body);
    if reason is not null then raise exception '%', reason; end if;
  end if;

  if tg_op = 'INSERT' then
    new.blocked_for_recipient := exists(
      select 1
      from public.relationship_blocks b
      where b.relationship_id = new.relationship_id
        and b.blocker_id = new.recipient_id
        and b.blocked_user_id = new.sender_id
        and (b.expires_at is null or b.expires_at > now())
    );

    if not new.blocked_for_recipient and new.body is not null then
      boundary_match := private.matching_personal_boundary(
        new.recipient_id,
        new.relationship_id,
        new.body
      );
      if boundary_match is not null then
        raise exception 'Message matches a recipient''s private Personal Boundary. Rephrase or remove the sensitive topic.';
      end if;
    end if;

    -- All storage-boundary checks have now seen the plaintext. Do not persist it.
    -- Legacy rows remain covered by maybe_scrub_message(); new rows are ciphertext-only
    -- in public.messages from their first durable tuple.
    new.body := null;
    new.plaintext_scrubbed_at := coalesce(new.plaintext_scrubbed_at, now());
  end if;

  return new;
end;
$$;

-- A SHA-256 of a short unread message is itself sensitive: a modified client can
-- dictionary-guess common phrases even when body/ciphertext are withheld. Keep the
-- server-approved hash hidden from an incoming participant until the message is
-- actually opened. The opened RPC still returns it so the client can verify that
-- decrypted ciphertext exactly matches the text TalkTwo approved at send time.
create or replace function public.list_relationship_messages(rel_id uuid)
returns table(
  id uuid,
  logical_id uuid,
  relationship_id uuid,
  sender_id uuid,
  recipient_id uuid,
  body text,
  body_hash text,
  ciphertext text,
  risk_level text,
  created_at timestamptz,
  available_at timestamptz,
  opened_at timestamptz,
  withdrawn_at timestamptz,
  edited_at timestamptz,
  rejected_at timestamptz,
  reject_reason text,
  blocked_for_recipient boolean,
  recipient_count integer,
  rejected_count integer
)
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
      case when m.blocked_for_recipient or m.opened_at is null then null else m.body_hash end as body_hash,
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

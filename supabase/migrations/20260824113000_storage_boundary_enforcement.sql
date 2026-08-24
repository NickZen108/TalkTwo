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

create or replace function private.enforce_message_privacy_invariants()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reason text;
  boundary_phrase text;
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
      boundary_phrase := private.matching_personal_boundary(
        new.recipient_id,
        new.relationship_id,
        new.body
      );
      if boundary_phrase is not null then
        raise exception 'Message contains a recipient''s blocked word or phrase: "%"', boundary_phrase;
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

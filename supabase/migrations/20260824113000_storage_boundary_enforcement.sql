-- Final storage-level Personal Boundary enforcement.
-- Earlier message/document RPCs predate timed blocks and can therefore see an
-- expired relationship_blocks row before the later privacy trigger normalizes
-- blocked_for_recipient. Enforce the boundary again at the actual INSERT so an
-- expired block can never bypass the recipient's active Personal Boundaries.

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
  end if;

  return new;
end;
$$;

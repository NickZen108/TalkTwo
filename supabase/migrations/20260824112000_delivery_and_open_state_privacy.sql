-- Delivery is app-level acknowledgement, not a read receipt. Also remove the
-- edit/withdraw-until-opened side channel: operation success must never reveal
-- whether another participant opened or rejected a message.

create or replace function public.ack_all_available_messages_delivered()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
declare changed integer := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  update public.messages m
  set delivered_at=coalesce(m.delivered_at,now())
  where m.recipient_id=uid
    and m.available_at<=now()
    and m.withdrawn_at is null
    and m.delivered_at is null;
  get diagnostics changed=row_count;
  return changed;
end;
$$;

-- Backward-compatible client call: a chat-specific sync acknowledges every
-- currently available message, so its effect cannot identify which chat was opened.
create or replace function public.ack_available_messages_delivered(rel_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$;

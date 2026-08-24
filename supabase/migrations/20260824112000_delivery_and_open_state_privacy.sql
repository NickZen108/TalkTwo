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
    and m.rejected_at is null
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
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return public.ack_all_available_messages_delivered();
end;
$$;

-- Privacy-first v1 does not let the sender probe recipient open state by asking
-- whether an edit or withdrawal is still possible.
create or replace function public.withdraw_message(message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return false;
end;
$$;

create or replace function public.edit_unopened_message(message_id uuid,new_body text,encrypted_body text)
returns table(id uuid,logical_id uuid,relationship_id uuid,sender_id uuid,recipient_id uuid,body text,body_hash text,ciphertext text,risk_level text,created_at timestamptz,available_at timestamptz,opened_at timestamptz,withdrawn_at timestamptz,edited_at timestamptz,rejected_at timestamptz,reject_reason text,blocked_for_recipient boolean,recipient_count integer,rejected_count integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  raise exception 'Sent messages cannot be edited. This avoids exposing recipient open state.';
end;
$$;

revoke execute on function public.ack_all_available_messages_delivered() from public,anon;
revoke execute on function public.ack_available_messages_delivered(uuid) from public,anon;
revoke execute on function public.withdraw_message(uuid) from public,anon;
revoke execute on function public.edit_unopened_message(uuid,text,text) from public,anon;
grant execute on function public.ack_all_available_messages_delivered() to authenticated,service_role;
grant execute on function public.ack_available_messages_delivered(uuid) to authenticated,service_role;
grant execute on function public.withdraw_message(uuid) to authenticated,service_role;
grant execute on function public.edit_unopened_message(uuid,text,text) to authenticated,service_role;

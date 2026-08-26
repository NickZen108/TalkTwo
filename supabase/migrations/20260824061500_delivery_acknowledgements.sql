-- Delivery acknowledgements deliberately expose only aggregate delivery counts to
-- senders. They never expose opened_at, an opening timestamp or recipient identity.

create or replace function public.ack_available_messages_delivered(rel_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  changed integer := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if rel_id is null then raise exception 'Relationship required'; end if;

  update public.messages m
     set delivered_at = coalesce(m.delivered_at, now())
   where m.relationship_id = rel_id
     and m.recipient_id = uid
     and m.available_at <= now()
     and m.withdrawn_at is null
     and m.rejected_at is null
     and m.delivered_at is null;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.list_my_sent_delivery_status(rel_id uuid)
returns table(
  logical_id uuid,
  recipient_count integer,
  delivered_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.logical_id,
    count(*)::integer as recipient_count,
    count(*) filter (where m.delivered_at is not null)::integer as delivered_count
  from public.messages m
  where m.relationship_id = rel_id
    and m.sender_id = (select auth.uid())
  group by m.logical_id
  order by min(m.created_at), m.logical_id;
$$;

revoke execute on function public.ack_available_messages_delivered(uuid) from public, anon;
revoke execute on function public.list_my_sent_delivery_status(uuid) from public, anon;

grant execute on function public.ack_available_messages_delivered(uuid) to authenticated, service_role;
grant execute on function public.list_my_sent_delivery_status(uuid) to authenticated, service_role;

-- Keep other members' data and paid benefits while removing the deleting user.
-- Auth deletion remains one database transaction; no client role receives direct
-- DELETE access to auth.users or to the private cleanup functions below.

alter table public.relationships
  alter column created_by drop not null;
alter table public.relationships
  drop constraint if exists relationships_created_by_fkey;
alter table public.relationships
  add constraint relationships_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.premium_gifts
  alter column purchaser_id drop not null;
alter table public.premium_gifts
  drop constraint if exists premium_gifts_purchaser_id_fkey;
alter table public.premium_gifts
  add constraint premium_gifts_purchaser_id_fkey
  foreign key (purchaser_id) references auth.users(id) on delete set null;

alter table public.premium_sponsorship_credits
  alter column payer_user_id drop not null;
alter table public.premium_sponsorship_credits
  drop constraint if exists premium_sponsorship_credits_payer_user_id_fkey;
alter table public.premium_sponsorship_credits
  add constraint premium_sponsorship_credits_payer_user_id_fkey
  foreign key (payer_user_id) references auth.users(id) on delete set null;

alter table public.store_purchase_events
  alter column user_id drop not null;
alter table public.store_purchase_events
  drop constraint if exists store_purchase_events_user_id_fkey;
alter table public.store_purchase_events
  add constraint store_purchase_events_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.premium_store_subscriptions
  alter column payer_user_id drop not null;
alter table public.premium_store_subscriptions
  drop constraint if exists premium_store_subscriptions_payer_user_id_fkey;
alter table public.premium_store_subscriptions
  add constraint premium_store_subscriptions_payer_user_id_fkey
  foreign key (payer_user_id) references auth.users(id) on delete set null;

alter table public.premium_store_subscription_members
  drop constraint if exists premium_store_subscription_members_user_id_fkey;
alter table public.premium_store_subscription_members
  add constraint premium_store_subscription_members_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.prepare_talktwo_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.premium_store_subscriptions
     set status = case
           when current_period_end <= pg_catalog.now() then 'expired'
           when status in ('active', 'grace_period', 'on_hold') then 'cancel_at_period_end'
           else status
         end,
         auto_renew = false,
         updated_at = pg_catalog.now()
   where payer_user_id = old.id;
  return old;
end;
$$;

revoke all on function private.prepare_talktwo_account_deletion() from public, anon, authenticated;

drop trigger if exists prepare_talktwo_account_deletion on auth.users;
create trigger prepare_talktwo_account_deletion
before delete on auth.users
for each row execute function private.prepare_talktwo_account_deletion();

create or replace function private.keep_deleted_payer_subscription_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.payer_user_id is null then
    new.payer_user_id := null;
    new.current_period_start := old.current_period_start;
    new.current_period_end := old.current_period_end;
    new.auto_renew := false;
    new.status := case
      when old.current_period_end <= pg_catalog.now() then 'expired'
      when old.status = 'revoked' then 'revoked'
      else 'cancel_at_period_end'
    end;
  end if;
  return new;
end;
$$;

revoke all on function private.keep_deleted_payer_subscription_closed() from public, anon, authenticated;

drop trigger if exists keep_deleted_payer_subscription_closed on public.premium_store_subscriptions;
create trigger keep_deleted_payer_subscription_closed
before update on public.premium_store_subscriptions
for each row execute function private.keep_deleted_payer_subscription_closed();

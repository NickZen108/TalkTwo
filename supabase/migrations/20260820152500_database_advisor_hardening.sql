-- Cover foreign keys used by deletes, membership changes and store reconciliation.
create index if not exists billing_checkout_intents_invitation_idx
  on public.billing_checkout_intents (invitation_id)
  where invitation_id is not null;

create index if not exists billing_checkout_intents_member_user_idx
  on public.billing_checkout_intents (member_user_id)
  where member_user_id is not null;

create index if not exists billing_checkout_intents_relationship_idx
  on public.billing_checkout_intents (relationship_id)
  where relationship_id is not null;

create index if not exists premium_gifts_claimed_by_idx
  on public.premium_gifts (claimed_by)
  where claimed_by is not null;

create index if not exists premium_gifts_purchaser_idx
  on public.premium_gifts (purchaser_id)
  where purchaser_id is not null;

create index if not exists premium_sponsorship_recipient_idx
  on public.premium_sponsorship_credits (recipient_user_id)
  where recipient_user_id is not null;

create index if not exists store_purchase_events_checkout_intent_idx
  on public.store_purchase_events (checkout_intent_id)
  where checkout_intent_id is not null;

-- One SELECT policy avoids evaluating two permissive policies for every row.
-- Wrapping auth helpers in scalar subqueries lets Postgres initialize them once.
drop policy if exists premium_gifts_purchaser_select on public.premium_gifts;
drop policy if exists premium_gifts_recipient_select on public.premium_gifts;
drop policy if exists premium_gifts_visible_select on public.premium_gifts;

create policy premium_gifts_visible_select
on public.premium_gifts
for select
to authenticated
using (
  purchaser_id = (select auth.uid())
  or (
    recipient_email = lower(
      pg_catalog.btrim(
        coalesce((select auth.jwt()) ->> 'email', '')
      )
    )
    and status = 'paid'
    and claim_expires_at > now()
  )
);

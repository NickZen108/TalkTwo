-- TalkTwo v1 has exactly one consumable Premium gift product: one month for
-- 59 DKK. Keep checkout-intent creation aligned with the verified store catalog
-- so an old/modified client cannot create an unfulfillable multi-month intent.

create or replace function public.create_premium_gift_checkout_intent(
  recipient text,
  months smallint default 1
)
returns table(
  intent_id uuid,
  amount_minor integer,
  currency text,
  recurring boolean,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  normalized text := lower(trim(coalesce(recipient, '')));
  new_id uuid;
  expiry timestamptz := pg_catalog.now() + interval '30 minutes';
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid recipient email is required';
  end if;
  if months is distinct from 1::smallint then
    raise exception 'TalkTwo Premium gifts are one month only';
  end if;

  insert into public.billing_checkout_intents(
    user_id, kind, recipient_email, duration_months,
    amount_minor, recurring, expires_at
  ) values (
    uid, 'premium_gift', normalized, 1, 5900, false, expiry
  ) returning id into new_id;

  return query select new_id, 5900, 'dkk'::text, false, expiry;
end;
$$;

revoke execute on function public.create_premium_gift_checkout_intent(text, smallint)
  from public, anon;
grant execute on function public.create_premium_gift_checkout_intent(text, smallint)
  to authenticated;

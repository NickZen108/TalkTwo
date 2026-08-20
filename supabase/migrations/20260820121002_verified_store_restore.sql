-- Restore is acknowledgement-only: it never grants a new entitlement.
-- The verified provider identity must already belong to the same TalkTwo user.

create or replace function public.confirm_verified_store_restore(
  p_platform text,
  p_product_id text,
  p_provider_transaction_id text,
  p_provider_original_transaction_id text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_transaction text := nullif(trim(coalesce(p_provider_transaction_id, '')), '');
  normalized_original text := nullif(trim(coalesce(p_provider_original_transaction_id, '')), '');
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if p_platform not in ('apple', 'google') then
    raise exception 'Unsupported store platform';
  end if;
  if p_product_id is null or trim(p_product_id) = '' then
    raise exception 'Product id required';
  end if;
  if p_user_id is null then
    raise exception 'User id required';
  end if;
  if normalized_transaction is null and normalized_original is null then
    raise exception 'Provider transaction identity required';
  end if;

  return exists (
    select 1
      from public.store_purchase_events event
     where event.platform = p_platform
       and event.product_id = trim(p_product_id)
       and event.user_id = p_user_id
       and (
         (normalized_transaction is not null and event.provider_transaction_id = normalized_transaction)
         or (
           normalized_original is not null
           and event.provider_original_transaction_id = normalized_original
         )
       )
  );
end;
$$;

revoke execute on function public.confirm_verified_store_restore(
  text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.confirm_verified_store_restore(
  text, text, text, text, uuid
) to service_role;

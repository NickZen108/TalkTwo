import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const grants = fs.readFileSync('supabase/migrations/20260825101500_premium_entitlement_grants.sql','utf8');
const refundHook = fs.readFileSync('supabase/migrations/20260825102500_premium_gift_refund_hook.sql','utf8');

test('gift and organization time are source-specific revocable grants',()=>{
  assert.match(grants,/create table if not exists public\.premium_time_grants/i);
  assert.match(grants,/source_kind in \('premium_gift','organization_sponsorship'\)/i);
  assert.match(grants,/unique\(source_kind, source_id\)/i);
  assert.match(grants,/revoked_at timestamptz/i);
  assert.match(grants,/revoke all on table public\.premium_time_grants from public, anon, authenticated/i);
});

test('projection derives Premium from active source ledgers rather than preserving opaque end dates',()=>{
  assert.match(grants,/from public\.premium_store_subscription_members m[\s\S]*premium_store_subscriptions/i);
  assert.match(grants,/from public\.premium_time_grants g/i);
  assert.match(grants,/create or replace function public\.sync_store_premium_user_plan/i);
  assert.match(grants,/return private\.recompute_premium_projection\(target_user,removed_period_end is not null\)/i);
  const sync=grants.match(/create or replace function public\.sync_store_premium_user_plan[\s\S]*?\$\$;/i)?.[0]??'';
  assert.doesNotMatch(sync,/current_plan\.premium_ends_at/i);
});

test('source removal reflows only surviving unconsumed grant duration',()=>{
  assert.match(grants,/remaining := grant_row\.ends_at - greatest\(pg_catalog\.now\(\),grant_row\.starts_at\)/i);
  assert.match(grants,/where g\.user_id=target_user[\s\S]*g\.revoked_at is null[\s\S]*g\.ends_at > pg_catalog\.now\(\)/i);
  assert.match(grants,/starts_at=base_end[\s\S]*ends_at=base_end\+remaining/i);
});

test('gift payment replay cannot change purchaser recipient provider or duration',()=>{
  assert.match(grants,/Premium gifts are one month only/i);
  assert.match(grants,/talktwo:premium-gift-payment:/i);
  assert.match(grants,/g\.purchaser_id is distinct from purchaser/i);
  assert.match(grants,/g\.recipient_email<>normalized_recipient/i);
  assert.match(grants,/g\.payment_provider is distinct from normalized_provider/i);
  assert.match(grants,/Premium gift payment identity mismatch/i);
});

test('claimed gift refund revokes only its grant and recomputes the recipient projection',()=>{
  const refund=grants.match(/create or replace function public\.refund_premium_gift_by_provider_payment[\s\S]*?\$\$;/i)?.[0]??'';
  assert.match(refund,/set status='refunded'/i);
  assert.match(refund,/source_kind='premium_gift' and t\.source_id=g\.id/i);
  assert.match(refund,/private\.recompute_premium_projection\(g\.claimed_by,true\)/i);
});

test('organization sponsorship revocation uses the same source-specific projection path',()=>{
  assert.match(grants,/private\.add_premium_time_grant\(uid,'organization_sponsorship'/i);
  assert.match(grants,/create or replace function public\.revoke_organization_sponsorship/i);
  assert.match(grants,/source_kind='organization_sponsorship' and g\.source_id=s\.id/i);
});

test('legacy parallel sponsorship RPCs are retired only after a fail-closed empty-table check',()=>{
  assert.match(grants,/if exists\(select 1 from public\.premium_sponsorship_credits limit 1\)/i);
  assert.match(grants,/manual migration required/i);
  for(const fn of ['claim_premium_sponsorship','claim_targeted_premium_sponsorship','list_my_available_premium_gifts','list_my_premium_sponsorships','rotate_premium_sponsorship_claim','activate_premium_sponsorship','create_premium_sponsorship_credit']){
    assert.match(grants,new RegExp(`drop function if exists public\\.${fn}`,'i'));
  }
  assert.match(grants,/drop table public\.premium_sponsorship_credits restrict/i);
});

test('verified provider gift refund remains in the same transaction as ordered store processing',()=>{
  assert.match(refundHook,/rename to process_verified_store_notification_ordered_v31/i);
  assert.match(refundHook,/billing_intent_kind='premium_gift'/i);
  assert.match(refundHook,/inner_result:=public\.process_verified_store_notification_ordered_v31/i);
  assert.match(refundHook,/refund_premium_gift_by_provider_payment/i);
  assert.match(refundHook,/Verified Premium gift refund could not be linked/i);
  assert.match(refundHook,/processing_result='premium_gift_refunded'/i);
});

test('renamed inner store processor is no longer directly executable by service clients',()=>{
  assert.match(refundHook,/revoke execute on function public\.process_verified_store_notification_ordered_v31[\s\S]*service_role/i);
  assert.match(refundHook,/grant execute on function public\.process_verified_store_notification[\s\S]*to service_role/i);
});

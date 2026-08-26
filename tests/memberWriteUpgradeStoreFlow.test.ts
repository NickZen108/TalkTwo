import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const flow = fs.readFileSync('supabase/migrations/20260824115500_member_write_upgrade_store_flow.sql', 'utf8');
const guard = fs.readFileSync('supabase/migrations/20260824115600_member_write_upgrade_replacement_guard.sql', 'utf8');
const recovery = fs.readFileSync('supabase/migrations/20260824115700_member_upgrade_checkout_recovery.sql', 'utf8');
const resumable = fs.readFileSync('supabase/migrations/20260824115800_resumable_member_upgrade_checkout.sql', 'utf8');
const approvalSnapshot = fs.readFileSync('supabase/migrations/20260824115900_member_upgrade_approval_snapshot.sql', 'utf8');
const verifier = fs.readFileSync('supabase/functions/verify-store-purchase/index.ts', 'utf8');
const billingHook = fs.readFileSync('src/hooks/useNativeStoreBilling.ts', 'utf8');
const memberBilling = fs.readFileSync('src/services/memberBilling.ts', 'utf8');
const home = fs.readFileSync('src/screens/HomeScreen.tsx', 'utf8');

test('write upgrades require a dedicated request and every current other member approval', () => {
  assert.match(flow, /create table if not exists public\.member_write_upgrade_requests/i);
  assert.match(flow, /create table if not exists public\.member_write_upgrade_approvals/i);
  assert.match(flow, /join public\.relationship_members m on m\.relationship_id=r\.relationship_id/i);
  assert.match(flow, /a\.decision is distinct from true/i);
  assert.match(flow, /create_member_write_upgrade_request/i);
  assert.match(flow, /respond_member_write_upgrade/i);
  assert.match(flow, /Every current chat member must approve writing access first/i);
});

test('an already-paid participant entitlement still needs fresh chat approval but no second purchase', () => {
  assert.match(flow, /activate_member_write_upgrade_from_existing_access/i);
  assert.match(flow, /s\.access_role='participant'/i);
  assert.match(flow, /member_write_upgrade_is_unanimous\(request\.id\)/i);
  assert.match(flow, /set role='participant', price_dkk=99/i);
});

test('store checkout is the recurring 99 DKK participant product binding, never the legacy one-time upgrade', () => {
  assert.match(flow, /values\(uid,'extra_member_start',rel_id,uid,request\.id,9900,'dkk',true,expiry\)/i);
  assert.match(flow, /upgrade_request_id/i);
  assert.match(flow, /Legacy write upgrade is disabled; verified subscription replacement is required/i);
  assert.doesNotMatch(flow, /values\([^\n]*'extra_member_upgrade'[^\n]*false/i);
});

test('store verification proves the participant subscription replaces the original observer subscription', () => {
  assert.match(flow, /get_member_upgrade_verification_context/i);
  assert.match(verifier, /linkedPurchaseToken/i);
  assert.match(verifier, /event\.providerOriginalTransactionId === expectedProviderId/i);
  assert.match(verifier, /googleLinkedPurchaseToken === expectedProviderId/i);
  assert.match(verifier, /subscription_replacement_mismatch/i);
});

test('mobile Android upgrade uses Google Play subscription replacement with prorated charge', () => {
  assert.match(billingHook, /purchaseMemberUpgrade/i);
  assert.match(billingHook, /extra_observer_monthly/i);
  assert.match(billingHook, /extra_participant_monthly/i);
  assert.match(billingHook, /purchaseToken:\s*googleReplacementPurchaseToken/i);
  assert.match(billingHook, /replacementMode:\s*2/i);
  assert.match(billingHook, /originalProvider !== platform/i);
});

test('interrupted native checkout can be cancelled or resumed without creating concurrent authorizations', () => {
  assert.match(guard, /A store upgrade is already in progress/i);
  assert.match(recovery, /cancel_my_billing_checkout_intent/i);
  assert.match(recovery, /set status='awaiting_payment'/i);
  // The resumable migration selects with table alias r.
  assert.match(resumable, /r\.status in \('awaiting_payment','checkout_pending'\)/i);
  assert.match(resumable, /return query select existing_intent\.id,9900,'dkk'::text,true,existing_intent\.expires_at/i);
  assert.match(billingHook, /Reconcile a still-authorized pending intent/i);
});

test('store completion uses the approval snapshot frozen when checkout began', () => {
  assert.match(approvalSnapshot, /member_write_upgrade_checkout_snapshot_approved/i);
  assert.match(approvalSnapshot, /a\.decision is distinct from true/i);
  assert.match(approvalSnapshot, /request\.status<>'checkout_pending'/i);
  assert.doesNotMatch(approvalSnapshot, /member_write_upgrade_is_unanimous\(request\.id\)/i);
});

test('mobile exposes request approval and store continuation only through the new workflow', () => {
  assert.match(memberBilling, /create_member_write_upgrade_request/i);
  assert.match(memberBilling, /list_pending_member_write_upgrade_approvals/i);
  assert.match(memberBilling, /respond_member_write_upgrade/i);
  assert.doesNotMatch(memberBilling, /get_member_write_upgrade_offer/i);
  assert.match(home, /createMemberWriteUpgradeRequest/i);
  assert.match(home, /respondMemberWriteUpgrade/i);
  assert.match(home, /storeBilling\.purchaseMemberUpgrade/i);
  assert.match(home, /settings\.approve/i);
  assert.match(home, /settings\.reject/i);
});

test('authenticated clients never receive provider purchase tokens from upgrade preflight', () => {
  assert.match(recovery, /returns table\(payment_provider text\)/i);
  assert.doesNotMatch(recovery, /returns table\([^)]*provider_subscription_id/i);
  assert.match(flow, /revoke execute on function public\.get_member_upgrade_verification_context\(uuid,uuid\) from public,anon,authenticated/i);
});

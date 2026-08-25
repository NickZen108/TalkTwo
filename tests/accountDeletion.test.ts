import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ACCOUNT_DELETE_CONFIRMATION, accountDeleteConfirmed } from '../src/domain/accountDeletion';

const deleteAccountEdge = fs.readFileSync('supabase/functions/delete-account/index.ts', 'utf8');
const deletionGate = fs.readFileSync('supabase/checks/account_deletion_schema.sql', 'utf8');
const memberUpgrade = fs.readFileSync('supabase/migrations/20260824115500_member_write_upgrade_store_flow.sql', 'utf8');
const recoveryRevalidation = fs.readFileSync('supabase/migrations/20260824120000_key_recovery_membership_revalidation.sql', 'utf8');

test('account deletion requires an explicit uppercase confirmation', () => {
  assert.equal(ACCOUNT_DELETE_CONFIRMATION, 'DELETE');
  assert.equal(accountDeleteConfirmed('DELETE'), true);
  assert.equal(accountDeleteConfirmed(' DELETE '), true);
  assert.equal(accountDeleteConfirmed('delete'), false);
  assert.equal(accountDeleteConfirmed('DELETE ACCOUNT'), false);
  assert.equal(accountDeleteConfirmed(''), false);
});

test('account deletion globally revokes refresh sessions before deleting the Auth user', () => {
  const globalSignOut = deleteAccountEdge.indexOf("userClient.auth.signOut({ scope: 'global' })");
  const deleteUser = deleteAccountEdge.indexOf('supabaseAdmin().auth.admin.deleteUser(user.id)');
  assert.ok(globalSignOut >= 0, 'global sign-out must be present');
  assert.ok(deleteUser > globalSignOut, 'Auth user deletion must happen after global sign-out');
  assert.match(deleteAccountEdge, /if \(signOutError\) throw signOutError/);
});

test('post-deploy deletion gate rejects every public auth.users RESTRICT/NO ACTION FK', () => {
  assert.match(deletionGate, /con\.confrelid = 'auth\.users'::regclass/i);
  assert.match(deletionGate, /con\.confdeltype in \('a', 'r'\)/i);
  assert.match(deletionGate, /Account deletion can be blocked by public auth\.users FKs/i);
});

test('write-upgrade audit rows cannot block deletion of either requester or approver', () => {
  assert.match(memberUpgrade, /member_user_id uuid not null references auth\.users\(id\) on delete cascade/i);
  assert.match(memberUpgrade, /approver_id uuid not null references auth\.users\(id\) on delete cascade/i);
  assert.match(memberUpgrade, /upgrade_request_id uuid[\s\S]*on delete set null/i);
});

test('outstanding key recovery authority is inaccessible after requester membership disappears', () => {
  assert.match(recoveryRevalidation, /join public\.relationship_members requester/i);
  assert.match(recoveryRevalidation, /requester\.user_id=request\.requester_id/i);
  assert.match(recoveryRevalidation, /Both recovery participants must still be active relationship members/i);
});

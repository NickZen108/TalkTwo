import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ACCOUNT_DELETE_CONFIRMATION, accountDeleteConfirmed } from '../src/domain/accountDeletion';

const deleteAccountEdge = fs.readFileSync('supabase/functions/delete-account/index.ts', 'utf8');

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

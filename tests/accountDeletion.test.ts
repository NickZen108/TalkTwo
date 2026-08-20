import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCOUNT_DELETE_CONFIRMATION, accountDeleteConfirmed } from '../src/domain/accountDeletion';

test('account deletion requires an explicit uppercase confirmation', () => {
  assert.equal(ACCOUNT_DELETE_CONFIRMATION, 'DELETE');
  assert.equal(accountDeleteConfirmed('DELETE'), true);
  assert.equal(accountDeleteConfirmed(' DELETE '), true);
  assert.equal(accountDeleteConfirmed('delete'), false);
  assert.equal(accountDeleteConfirmed('DELETE ACCOUNT'), false);
  assert.equal(accountDeleteConfirmed(''), false);
});

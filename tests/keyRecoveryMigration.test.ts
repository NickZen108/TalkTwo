import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260820151327_secure_key_recovery.sql', 'utf8');
const revalidation = fs.readFileSync('supabase/migrations/20260824120000_key_recovery_membership_revalidation.sql', 'utf8');
const threadKeys = fs.readFileSync('src/services/threadKeys.ts', 'utf8');

test('recovery secrets and plaintext conversation keys never enter the database', () => {
  assert.match(migration, /key_envelope text/i);
  assert.doesNotMatch(migration, /recovery_secret|thread_key|conversation_key/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.relationship_key_recovery_requests from public, anon, authenticated/i);
});

test('only another current relationship member can fulfill recovery', () => {
  assert.match(revalidation, /request\.requester_id=caller[\s\S]*different chat member must approve/i);
  assert.match(revalidation, /requester\.user_id=request\.requester_id/i);
  assert.match(revalidation, /approver\.user_id=caller/i);
  assert.match(revalidation, /r\.status='active'/i);
  assert.match(revalidation, /request\.status<>'pending'[\s\S]*expires_at/i);
});

test('losing relationship membership revokes outstanding recovery authority', () => {
  assert.match(revalidation, /join public\.relationship_members requester[\s\S]*requester\.user_id=q\.requester_id/i);
  assert.match(revalidation, /Both recovery participants must still be active relationship members/i);
  assert.match(revalidation, /list_my_key_recovery_requests[\s\S]*join public\.relationship_members requester/i);
});

test('only the requester can list, complete or cancel their recovery', () => {
  assert.match(revalidation, /q\.requester_id=\(select auth\.uid\(\)\)/i);
  assert.match(migration, /q\.id = recovery_id and q\.requester_id = auth\.uid\(\) and q\.status = 'fulfilled'/i);
  assert.match(revalidation, /grant execute[\s\S]*to authenticated/i);
});

test('recovery envelope authentication binds both token and relationship', () => {
  assert.match(threadKeys, /function recoveryAad\(token: string, relationshipId: string\)/);
  assert.match(threadKeys, /talktwo-key-recovery-v2:\$\{token\.trim\(\)\}:\$\{assertRelationshipId\(relationshipId\)\}/);
  assert.match(threadKeys, /aesEncryptAsync[\s\S]*additionalData: recoveryAad\(token, relationshipId\)/);
  assert.match(threadKeys, /aesDecryptAsync[\s\S]*additionalData: recoveryAad\(token, relationshipId\)/);
});

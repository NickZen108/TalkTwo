import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260820151327_secure_key_recovery.sql', 'utf8');
const threadKeys = fs.readFileSync('src/services/threadKeys.ts', 'utf8');

test('recovery secrets and plaintext conversation keys never enter the database', () => {
  assert.match(migration, /key_envelope text/i);
  assert.doesNotMatch(migration, /recovery_secret|thread_key|conversation_key/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.relationship_key_recovery_requests from public, anon, authenticated/i);
});

test('only another current relationship member can fulfill recovery', () => {
  assert.match(migration, /request\.requester_id = caller[\s\S]*different chat member must approve/i);
  assert.match(migration, /m\.relationship_id = request\.relationship_id and m\.user_id = caller/i);
  assert.match(migration, /status = 'pending'[\s\S]*expires_at/i);
});

test('only the requester can list, complete or cancel their recovery', () => {
  assert.match(migration, /where q\.requester_id = auth\.uid\(\)/i);
  assert.match(migration, /q\.id = recovery_id and q\.requester_id = auth\.uid\(\) and q\.status = 'fulfilled'/i);
  assert.match(migration, /grant execute[\s\S]*to authenticated/i);
});

test('recovery envelope authentication binds both token and relationship', () => {
  assert.match(threadKeys, /function recoveryAad\(token: string, relationshipId: string\)/);
  assert.match(threadKeys, /talktwo-key-recovery-v2:\$\{token\.trim\(\)\}:\$\{cleanRelationshipId\}/);
  assert.match(threadKeys, /aesEncryptAsync[\s\S]*additionalData: recoveryAad\(token, relationshipId\)/);
  assert.match(threadKeys, /aesDecryptAsync[\s\S]*additionalData: recoveryAad\(token, relationshipId\)/);
});

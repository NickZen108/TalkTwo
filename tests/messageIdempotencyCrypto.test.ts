import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const cryptoSource = fs.readFileSync('src/services/messageCrypto.ts', 'utf8');
const messageClient = fs.readFileSync('src/services/messages.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260825101000_message_send_idempotency.sql', 'utf8');

test('v2 ciphertext is bound to relationship and logical message id while v1 remains readable', () => {
  assert.match(cryptoSource, /talktwo-message-v1:\$\{relationshipId\}/);
  assert.match(cryptoSource, /talktwo-message-v2:\$\{relationshipId\}:\$\{logicalId\}/);
  assert.match(cryptoSource, /const V2_PREFIX = 'v2\.'/);
  assert.match(cryptoSource, /ciphertext\.startsWith\(V2_PREFIX\)/);
  assert.match(cryptoSource, /isV2 \? aadV2\(relationshipId, logicalId as string\) : aadV1\(relationshipId\)/);
});

test('client chooses one logical UUID before encryption and reuses it on one transient retry', () => {
  assert.match(messageClient, /const logicalId = randomUUID\(\)/);
  assert.match(messageClient, /encryptMessageBody\(relationshipId, clean, logicalId\)/);
  assert.match(messageClient, /client_message_id: logicalId/);
  assert.match(messageClient, /if \(result\.error && isTransientRpcError\(result\.error\)\) result = await supabase\.rpc\('send_message', args\)/);
  assert.match(messageClient, /row\.logical_id !== logicalId/);
  assert.match(messageClient, /row\.ciphertext !== encryptedBody/);
});

test('server serializes sender/id retries and rejects changed content under a reused id', () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(uid::text \|\| ':' \|\| client_message_id::text, 0\)\)/i);
  assert.match(migration, /where m\.sender_id = uid and m\.logical_id = client_message_id/i);
  assert.match(migration, /already used for different content/i);
  assert.match(migration, /existing_ciphertext is distinct from encrypted_body/i);
  assert.match(migration, /existing_kind is distinct from 'text'/i);
  assert.match(migration, /existing_kind is distinct from 'text_attachment'/i);
});

test('legacy authenticated send signatures are disabled and v2 payload marker is mandatory', () => {
  assert.match(migration, /encrypted_body not like 'v2\.%'/i);
  assert.match(migration, /revoke execute on function public\.send_message\(uuid, text, text\) from public, anon, authenticated/i);
  assert.match(migration, /revoke execute on function public\.send_text_attachment\(uuid, text, text, text, text, integer, integer\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.send_message\(uuid, text, text, uuid\) to authenticated, service_role/i);
});

test('attachment retries also bind metadata and server validates filename extension against MIME type', () => {
  assert.match(messageClient, /supabase\.rpc\('send_text_attachment', args\)/);
  assert.match(migration, /existing_name is distinct from clean_name/i);
  assert.match(migration, /existing_mime is distinct from requested_mime_type/i);
  assert.match(migration, /extension not in \('txt', 'md', 'markdown', 'csv'\)/i);
  assert.match(migration, /Document file extension and type do not match/i);
  assert.match(migration, /unsupported invisible formatting characters/i);
});

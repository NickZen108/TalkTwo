import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const threadKeys = fs.readFileSync('src/services/threadKeys.ts', 'utf8');
const relationships = fs.readFileSync('src/services/relationships.ts', 'utf8');

test('invitation envelopes are cryptographically bound to both token and conversation', () => {
  assert.match(threadKeys, /talktwo-key-envelope-v2:\$\{token\.trim\(\)\}:\$\{assertRelationshipId\(relationshipId\)\}/);
  assert.match(threadKeys, /createInvitationEnvelope\(token: string, relationshipId: string, threadKey: string\)/);
  assert.match(threadKeys, /openInvitationEnvelope\(token: string, relationshipId: string, secret: string, envelope: string\)/);
  assert.match(threadKeys, /additionalData: envelopeAad\(token, relationshipId\)/);
  assert.match(relationships, /createInvitationEnvelope\(token, relationshipId, threadKey\)/);
  assert.match(threadKeys, /openInvitationEnvelope\(token, relationshipId, secret, envelope\)/);
  assert.match(threadKeys, /openInvitationEnvelope\(parsed\.token, relationshipId, parsed\.secret, envelope\)/);
});

test('recovery envelopes remain bound to the authoritative conversation id', () => {
  assert.match(threadKeys, /talktwo-key-recovery-v2:\$\{token\.trim\(\)\}:\$\{assertRelationshipId\(relationshipId\)\}/);
  assert.match(threadKeys, /additionalData: recoveryAad\(token, relationshipId\)/);
});

test('first-use thread-key creation is serialized per conversation and rechecks secure storage', () => {
  assert.match(threadKeys, /const threadKeyCreation = new Map<string, Promise<string>>\(\)/);
  assert.match(threadKeys, /const inFlight = threadKeyCreation\.get\(cleanRelationshipId\)/);
  assert.match(threadKeys, /if \(inFlight\) return inFlight/);
  assert.match(threadKeys, /const rechecked = await getThreadKey\(cleanRelationshipId\)/);
  assert.match(threadKeys, /if \(rechecked\) return rechecked/);
  assert.match(threadKeys, /threadKeyCreation\.set\(cleanRelationshipId, creation\)/);
  assert.match(threadKeys, /threadKeyCreation\.delete\(cleanRelationshipId\)/);
});

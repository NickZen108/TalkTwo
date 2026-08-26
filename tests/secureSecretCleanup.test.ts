import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const keys = fs.readFileSync('src/services/threadKeys.ts', 'utf8');
const auth = fs.readFileSync('src/services/auth.ts', 'utf8');

test('thread, invite and recovery SecureStore entries are tracked in a deletion index', () => {
  assert.match(keys, /SECRET_INDEX_NAME\s*=\s*'talktwo\.secure-secret-index\.v1'/i);
  assert.match(keys, /THREAD_PREFIX[\s\S]*PENDING_TOKEN_PREFIX[\s\S]*PENDING_INVITATION_PREFIX[\s\S]*RECOVERY_REQUEST_PREFIX[\s\S]*RECOVERY_APPROVAL_PREFIX/i);
  assert.match(keys, /setTrackedSecret\(/i);
  assert.match(keys, /getTrackedSecret[\s\S]*migrates secrets written by pre-index TalkTwo builds/i);
});

test('normal sign-out clears transient invitation and recovery secrets but preserves thread-key cleanup semantics', () => {
  assert.match(keys, /clearPendingThreadSecrets[\s\S]*!name\.startsWith\(THREAD_PREFIX\)/i);
  assert.match(auth, /signOut\(\)[\s\S]*clearPendingThreadSecrets\(\)/i);
  assert.doesNotMatch(auth, /signOut\(\)[\s\S]{0,500}clearAllTalkTwoThreadSecrets\(\)/i);
});

test('permanent deletion clears legacy known thread keys and every indexed TalkTwo secret', () => {
  assert.match(auth, /deleteAccount[\s\S]*removeThreadKeys\(relationshipIds\)[\s\S]*clearAllTalkTwoThreadSecrets\(\)/i);
  assert.match(keys, /clearAllTalkTwoThreadSecrets[\s\S]*clearTrackedSecrets\(\(\) => true\)/i);
  assert.match(auth, /supabase\.auth\.signOut\(\{ scope: 'local' \}\)/i);
});

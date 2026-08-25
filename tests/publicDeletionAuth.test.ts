import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('public-site/src/main.js', 'utf8');
const page = fs.readFileSync('public-site/delete-account/index.html', 'utf8');

test('public deletion magic links use PKCE on the initiating browser/device', () => {
  assert.match(source, /detectSessionInUrl:\s*true/i);
  assert.match(source, /flowType:\s*'pkce'/i);
  assert.match(source, /shouldCreateUser:\s*false/i);
  assert.match(source, /emailRedirectTo:\s*redirectTo/i);
  assert.match(page, /email address already attached to your TalkTwo account/i);
});

test('public deletion verifies the current user again before destructive action', () => {
  assert.match(source, /async function verifiedCurrentUser\(\)[\s\S]*supabase\.auth\.getUser\(\)/i);
  assert.match(source, /deleteForm\.addEventListener[\s\S]*const user = await verifiedCurrentUser\(\)/i);
  assert.match(source, /body:\s*\{ confirmation: 'DELETE' \}/i);
});

test('request UI does not distinguish unknown from existing email addresses', () => {
  assert.match(source, /genericLinkMessage/i);
  assert.match(source, /finally\s*\{[\s\S]*requestStatus\.textContent = genericLinkMessage/i);
  assert.doesNotMatch(source, /requestStatus\.textContent\s*=\s*error/i);
});

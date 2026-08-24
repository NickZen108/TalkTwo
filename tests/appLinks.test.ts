import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildTalkTwoLink, parseTalkTwoLink, talkTwoHttpsOrigin } from '../src/domain/appLinks';

const secret = 'a'.repeat(64);

test('development links use the custom scheme only when no site URL is configured', () => {
  const link = buildTalkTwoLink('invite', 'invite 1', { fragment: { s: secret } }, '');
  assert.equal(link, `talktwo://invite/invite%201#s=${secret}`);
  const parsed = parseTalkTwoLink(link, '');
  assert.equal(parsed?.family, 'invite');
  assert.deepEqual(parsed?.pathSegments, ['invite', 'invite%201']);
});

test('configured production links use the HTTPS origin and app namespace', () => {
  const site = 'https://secure.example/public/path';
  assert.equal(talkTwoHttpsOrigin(site), 'https://secure.example');
  const link = buildTalkTwoLink('recover-key', 'request 1', { fragment: { s: secret } }, site);
  assert.equal(link, `https://secure.example/app/recover-key/request%201#s=${secret}`);
  const parsed = parseTalkTwoLink(link, site);
  assert.equal(parsed?.family, 'recover-key');
  assert.deepEqual(parsed?.pathSegments, ['recover-key', 'request%201']);
});

test('production parser rejects custom schemes, look-alike origins and non-app paths', () => {
  const site = 'https://secure.example';
  assert.equal(parseTalkTwoLink(`talktwo://invite/id#s=${secret}`, site), null);
  assert.equal(parseTalkTwoLink(`https://secure.example.evil.invalid/app/invite/id#s=${secret}`, site), null);
  assert.equal(parseTalkTwoLink(`https://secure.example/invite/id#s=${secret}`, site), null);
});

test('invalid configured site URL fails closed rather than falling back to a custom scheme', () => {
  assert.throws(
    () => buildTalkTwoLink('auth', undefined, {}, 'http://insecure.example'),
    /public link configuration is invalid/i,
  );
  assert.equal(parseTalkTwoLink('talktwo://auth?code=abc', 'http://insecure.example'), null);
});

test('query and fragment values are encoded by one canonical builder', () => {
  const link = buildTalkTwoLink(
    'premium-gift',
    'gift/1',
    { query: { token: 'one two&three' }, fragment: { s: secret } },
    'https://secure.example',
  );
  assert.equal(
    link,
    `https://secure.example/app/premium-gift/gift%2F1?token=one+two%26three#s=${secret}`,
  );
});

test('auth, invitations, recovery and gift services cannot reintroduce raw custom-scheme generators', () => {
  for (const path of [
    'src/services/auth.ts',
    'src/services/relationships.ts',
    'src/services/keyRecovery.ts',
    'src/services/premiumGifts.ts',
  ]) {
    const source = fs.readFileSync(path, 'utf8');
    assert.match(source, /buildTalkTwoLink/);
    assert.doesNotMatch(source, /talktwo:\/\//i);
  }
});

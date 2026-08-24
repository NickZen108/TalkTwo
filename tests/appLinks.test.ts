import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildTalkTwoLink, parseTalkTwoLink, talkTwoHttpsOrigin } from '../src/domain/appLinks';

const secret = 'a'.repeat(64);

test('development links use the custom scheme only when no site URL is configured', () => {
  const link = buildTalkTwoLink('invite', undefined, { fragment: { token: 'invite 1', s: secret } }, '');
  assert.equal(link, `talktwo://invite#token=invite+1&s=${secret}`);
  const parsed = parseTalkTwoLink(link, '');
  assert.equal(parsed?.family, 'invite');
  assert.deepEqual(parsed?.pathSegments, ['invite']);
});

test('configured production links require one canonical HTTPS origin and app namespace', () => {
  const site = 'https://secure.example';
  assert.equal(talkTwoHttpsOrigin(site), 'https://secure.example');
  const link = buildTalkTwoLink(
    'recover-key',
    undefined,
    { fragment: { token: 'request 1', s: secret } },
    site,
  );
  assert.equal(link, `https://secure.example/app/recover-key#token=request+1&s=${secret}`);
  const parsed = parseTalkTwoLink(link, site);
  assert.equal(parsed?.family, 'recover-key');
  assert.deepEqual(parsed?.pathSegments, ['recover-key']);
});

test('production site configuration rejects paths, query, fragments and non-default ports', () => {
  for (const site of [
    'https://secure.example/public/path',
    'https://secure.example/?campaign=1',
    'https://secure.example/#section',
    'https://secure.example:8443',
  ]) {
    assert.equal(talkTwoHttpsOrigin(site), null);
    assert.throws(() => buildTalkTwoLink('auth', undefined, {}, site), /public link configuration is invalid/i);
  }
  assert.equal(talkTwoHttpsOrigin('https://secure.example/'), 'https://secure.example');
});

test('production parser rejects custom schemes, look-alike origins and non-app paths', () => {
  const site = 'https://secure.example';
  assert.equal(parseTalkTwoLink(`talktwo://invite#token=id&s=${secret}`, site), null);
  assert.equal(parseTalkTwoLink(`https://secure.example.evil.invalid/app/invite#token=id&s=${secret}`, site), null);
  assert.equal(parseTalkTwoLink(`https://secure.example/invite#token=id&s=${secret}`, site), null);
});

test('invalid configured site URL fails closed rather than falling back to a custom scheme', () => {
  assert.throws(
    () => buildTalkTwoLink('auth', undefined, {}, 'http://insecure.example'),
    /public link configuration is invalid/i,
  );
  assert.equal(parseTalkTwoLink('talktwo://auth?code=abc', 'http://insecure.example'), null);
});

test('auth codes use query encoding while possession secrets stay in fragments', () => {
  const auth = buildTalkTwoLink('auth', undefined, { query: { code: 'one two&three' } }, 'https://secure.example');
  assert.equal(auth, 'https://secure.example/app/auth?code=one+two%26three');

  const invite = buildTalkTwoLink(
    'invite',
    undefined,
    { fragment: { token: 'one two&three', s: secret } },
    'https://secure.example',
  );
  assert.equal(invite, `https://secure.example/app/invite#token=one+two%26three&s=${secret}`);

  const gift = buildTalkTwoLink(
    'premium-gift',
    'gift/1',
    { fragment: { token: 'one two&three' } },
    'https://secure.example',
  );
  assert.equal(gift, 'https://secure.example/app/premium-gift/gift%2F1#token=one+two%26three');
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

test('invitation and recovery generators keep bearer tokens out of URL paths and queries', () => {
  const relationships = fs.readFileSync('src/services/relationships.ts', 'utf8');
  const recovery = fs.readFileSync('src/services/keyRecovery.ts', 'utf8');

  assert.match(relationships, /buildTalkTwoLink\(path,\s*undefined,\s*\{\s*fragment:\s*\{\s*token,\s*s:\s*secret\s*\}\s*\}\)/s);
  assert.doesNotMatch(relationships, /buildTalkTwoLink\(path,\s*token/);
  assert.match(recovery, /buildTalkTwoLink\('recover-key',\s*undefined,\s*\{\s*fragment:\s*\{\s*token,\s*s:\s*material\.secret\s*\}\s*\}\)/s);
  assert.doesNotMatch(recovery, /buildTalkTwoLink\('recover-key',\s*token/);
});

test('Premium gift generator keeps its claim token out of the HTTPS query string', () => {
  const source = fs.readFileSync('src/services/premiumGifts.ts', 'utf8');
  assert.match(source, /fragment:\s*\{\s*token\s*\}/);
  assert.doesNotMatch(source, /query:\s*\{\s*token\s*\}/);
});

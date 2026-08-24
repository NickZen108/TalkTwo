import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildTalkTwoPublicSiteLinks } from '../src/lib/publicSite';

const account = fs.readFileSync('src/screens/AccountScreen.tsx', 'utf8');

test('public site links require an HTTPS base URL', () => {
  assert.equal(buildTalkTwoPublicSiteLinks(undefined), null);
  assert.equal(buildTalkTwoPublicSiteLinks(''), null);
  assert.equal(buildTalkTwoPublicSiteLinks('http://talktwo.app'), null);
  assert.equal(buildTalkTwoPublicSiteLinks('https://user:pass@talktwo.app'), null);
});

test('public site derives the four store-facing routes from one validated base URL', () => {
  assert.deepEqual(buildTalkTwoPublicSiteLinks('https://talktwo.app/'), {
    privacy: 'https://talktwo.app/privacy/',
    terms: 'https://talktwo.app/terms/',
    support: 'https://talktwo.app/support/',
    deleteAccount: 'https://talktwo.app/delete-account/',
  });
});

test('Account & privacy renders external links only when release configuration supplies them', () => {
  assert.match(account, /talkTwoPublicSiteLinks\s*\?/i);
  assert.match(account, /publicLinks\.length\s*>\s*0/i);
  assert.match(account, /accessibilityRole="link"/i);
  assert.match(account, /Linking\.openURL\(url\)/i);
  assert.doesNotMatch(account, /https:\/\/talktwo\.app/i);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const vite = fs.readFileSync('public-site/vite.config.js', 'utf8');
const config = fs.readFileSync('public-site/src/siteConfig.js', 'utf8');
const preflight = fs.readFileSync('public-site/scripts/release-preflight.mjs', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('public-site/package.json', 'utf8')) as { scripts?: Record<string, string> };

const routes = [
  ['home', 'public-site/index.html'],
  ['privacy', 'public-site/privacy/index.html'],
  ['terms', 'public-site/terms/index.html'],
  ['support', 'public-site/support/index.html'],
  ['deleteAccount', 'public-site/delete-account/index.html'],
  ['appLinkFallback', 'public-site/app/index.html'],
] as const;

test('Vite production build includes every store-facing and app-link fallback route', () => {
  for (const [input, path] of routes) {
    assert.ok(fs.existsSync(path), `missing ${path}`);
    assert.match(vite, new RegExp(`${input}:[\\s\\S]*${path.replace('public-site/', '').replace(/[./-]/g, '\\$&')}`, 'i'));
  }
});

test('legal and support pages remain visibly draft until explicit publication approval and backend config', () => {
  assert.match(config, /VITE_PUBLICATION_APPROVED/i);
  assert.match(config, /VITE_SUPABASE_URL/i);
  assert.match(config, /VITE_SUPABASE_PUBLISHABLE_KEY/i);
  assert.match(config, /publicationApproved[\s\S]*=== 'true'/i);
  assert.match(config, /missing\.push\('publicationApproved'\)/i);
  assert.match(config, /\^sb_publishable_/i);
  assert.match(config, /url\.protocol === 'https:'/i);
  for (const path of ['public-site/index.html', 'public-site/privacy/index.html', 'public-site/terms/index.html', 'public-site/support/index.html']) {
    const html = fs.readFileSync(path, 'utf8');
    assert.match(html, /data-publication-status/i);
    assert.match(html, /\/src\/publicPages\.js/i);
  }
});

test('app-link fallback is static and never inspects or transmits secret URL state', () => {
  const html = fs.readFileSync('public-site/app/index.html', 'utf8');
  assert.match(html, /name="referrer" content="no-referrer"/i);
  assert.match(html, /Content-Security-Policy/i);
  assert.match(html, /default-src 'none'/i);
  assert.match(html, /noindex,nofollow,noarchive/i);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /location\.(hash|search)|URLSearchParams|fetch\(|XMLHttpRequest|sendBeacon|analytics/i);
  assert.match(html, /does not read, display, copy or transmit link fragments/i);
});

test('public-site release preflight requires reviewed identity, contact, legal text and a current publishable key', () => {
  for (const name of [
    'VITE_LEGAL_ENTITY',
    'VITE_POSTAL_ADDRESS',
    'VITE_SUPPORT_EMAIL',
    'VITE_PRIVACY_EMAIL',
    'VITE_MINIMUM_AGE_RULE',
    'VITE_PROFESSIONAL_SERVICES_WORDING',
    'VITE_CONSUMER_RIGHTS_TEXT',
    'VITE_GOVERNING_LAW_TEXT',
    'VITE_INTERNATIONAL_TRANSFER_TEXT',
    'VITE_PRIVACY_EFFECTIVE_DATE',
    'VITE_PUBLICATION_APPROVED',
  ]) assert.match(preflight, new RegExp(name));

  assert.match(preflight, /\^sb_publishable_/i);
  assert.match(preflight, /secret and legacy service-role keys are forbidden/i);
  assert.equal(packageJson.scripts?.['release:preflight'], 'node scripts/release-preflight.mjs');
});

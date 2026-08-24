import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('scripts/release-preflight.mjs', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { scripts?: Record<string, string> };

test('release preflight rejects placeholder/private client configuration', () => {
  assert.match(source, /EXPO_PUBLIC_SUPABASE_URL/i);
  assert.match(source, /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/i);
  assert.match(source, /\^sb_publishable_/i);
  assert.match(source, /secret and legacy service-role keys are forbidden/i);
  assert.match(source, /EXPO_PUBLIC_TALKTWO_SITE_URL/i);
  assert.match(source, /url\.protocol === 'https:'/i);
  assert.match(source, /!url\.username && !url\.password/i);
});

test('release preflight locks native identifiers, SDK, versioning and artwork gates', () => {
  assert.match(source, /com\.talktwo\.app/i);
  assert.match(source, /compileSdkVersion/i);
  assert.match(source, /targetSdkVersion/i);
  assert.match(source, /appVersionSource/i);
  assert.match(source, /autoIncrement/i);
  assert.match(source, /Final Expo app icon asset is required/i);
  assert.match(source, /adaptive icon foreground asset is required/i);
  assert.match(source, /EAS project ID is required/i);
});

test('release preflight is explicitly runnable but not part of ordinary account-independent QA', () => {
  assert.equal(pkg.scripts?.['release:preflight'], 'node scripts/release-preflight.mjs');
  assert.doesNotMatch(pkg.scripts?.qa ?? '', /release:preflight/i);
});

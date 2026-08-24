import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script = 'public-site/scripts/release-preflight.mjs';

const validEnv = {
  ...process.env,
  VITE_SUPABASE_URL: 'https://example-project.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_AAAAAAAAAAAAAAAAAAAAAA_BBBBBBBB',
  VITE_SUPPORT_EMAIL: 'support@talktwo.test',
  VITE_PRIVACY_EMAIL: 'privacy@talktwo.test',
  VITE_LEGAL_ENTITY: 'TalkTwo Test Entity',
  VITE_POSTAL_ADDRESS: 'Test Street 1, 1000 Test City',
  VITE_MINIMUM_AGE_RULE: 'Users must meet the reviewed minimum age and capacity requirements.',
  VITE_PROFESSIONAL_SERVICES_WORDING: 'Use appropriate emergency or professional services when needed.',
  VITE_CONSUMER_RIGHTS_TEXT: 'Mandatory consumer rights remain unaffected.',
  VITE_GOVERNING_LAW_TEXT: 'Reviewed governing-law wording.',
  VITE_INTERNATIONAL_TRANSFER_TEXT: 'Reviewed international-transfer wording.',
  VITE_PRIVACY_EFFECTIVE_DATE: '2026-08-24',
  VITE_PUBLICATION_APPROVED: 'true',
};

function run(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
}

test('public-site release preflight succeeds only when all reviewed release inputs are present', () => {
  const result = run(validEnv);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /TalkTwo public-site release preflight OK\./i);
});

test('public-site release preflight rejects a private Supabase secret key', () => {
  const result = run({ ...validEnv, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_DO_NOT_SHIP_THIS' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sb_publishable_/i);
  assert.match(result.stderr, /forbidden in the browser/i);
});

test('public-site release preflight rejects missing publication approval', () => {
  const result = run({ ...validEnv, VITE_PUBLICATION_APPROVED: 'false' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /VITE_PUBLICATION_APPROVED/i);
});

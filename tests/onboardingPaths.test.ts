import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const start = fs.readFileSync('docs/START_HERE.md', 'utf8');
const user = fs.readFileSync('docs/USER_ONBOARDING_FLOW.md', 'utf8');
const organisation = fs.readFileSync('docs/ORGANIZATION_ADMIN_ONBOARDING.md', 'utf8');
const developer = fs.readFileSync('docs/DEVELOPER_ONBOARDING.md', 'utf8');
const owner = fs.readFileSync('docs/NEW_OWNER_ONBOARDING.md', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');
const login = fs.readFileSync('src/screens/LoginScreen.tsx', 'utf8');
const home = fs.readFileSync('src/screens/HomeScreen.tsx', 'utf8');

test('repository has one visible start-here path for each role', () => {
  for (const path of [
    'docs/USER_ONBOARDING_FLOW.md',
    'docs/ORGANIZATION_ADMIN_ONBOARDING.md',
    'docs/DEVELOPER_ONBOARDING.md',
    'docs/NEW_OWNER_ONBOARDING.md',
  ]) {
    assert.ok(fs.existsSync(path), `missing onboarding path ${path}`);
    assert.match(start, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(readme, /docs\/START_HERE\.md/);
});

test('user onboarding preserves a short first-run path', () => {
  assert.match(login, /login\.step1/);
  assert.match(login, /login\.step2/);
  assert.match(login, /login\.step3/);
  assert.match(home, /home\.startChat/);
  assert.match(user, /Do not require Premium purchase during onboarding/i);
  assert.match(user, /Do not force message-window setup/i);
});

test('organisation onboarding cannot become conversation monitoring', () => {
  assert.match(organisation, /sponsor\/payer/i);
  assert.match(organisation, /must not be able to see[\s\S]*conversation messages/i);
  assert.match(organisation, /Paying for access does not grant monitoring rights/i);
  assert.match(organisation, /do not expose Supabase dashboards or `service_role` to customers/i);
});

test('developer onboarding states the critical trust boundaries', () => {
  assert.match(developer, /publishable Supabase configuration only/i);
  assert.match(developer, /service_role.*machine credential/i);
  assert.match(developer, /does not imply a product feature for browsing conversation plaintext/i);
  assert.match(developer, /Android → iOS and iOS → Android/i);
});

test('new owner onboarding requires independent operation and seller removal', () => {
  assert.match(owner, /independent operation/i);
  assert.match(owner, /rotate every secret/i);
  assert.match(owner, /build both iOS and Android without the seller/i);
  assert.match(owner, /remove the seller today without breaking production/i);
});

test('start-here hub keeps administrative access separate from conversation access', () => {
  assert.match(start, /Administrative access is not conversation access/i);
  assert.match(start, /service_role.*not human roles/i);
});

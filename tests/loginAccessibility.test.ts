import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const screen = fs.readFileSync('src/screens/LoginScreen.tsx', 'utf8');
const translations = fs.readFileSync('src/i18n/translations.ts', 'utf8');

test('sign-in has semantic email and button controls', () => {
  assert.match(screen, /accessibilityLabel=\{t\('login\.emailLabel'\)\}/);
  assert.match(translations, /'login\.emailLabel': 'Email address'/);
  assert.match(screen, /autoComplete="email"/);
  assert.match(screen, /textContentType="emailAddress"/);
  assert.match(screen, /accessibilityRole="button"/);
  assert.match(screen, /accessibilityState=\{\{ disabled: busy \|\| !email\.includes\('@'\), busy \}\}/);
  assert.match(screen, /accessibilityLiveRegion="polite"/);
});

test('onboarding explains consent, local choices and safety limits', () => {
  assert.match(screen, /t\('login\.step1'\)/);
  assert.match(screen, /t\('login\.step3'\)/);
  assert.match(screen, /t\('login\.safety'\)/);
  assert.match(translations, /everyone already in the chat approves/i);
  assert.match(translations, /stay local to your device/i);
  assert.match(translations, /not emergency, medical, legal or crisis support/i);
});

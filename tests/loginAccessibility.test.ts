import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const screen = fs.readFileSync('src/screens/LoginScreen.tsx', 'utf8');

test('sign-in has semantic email and button controls', () => {
  assert.match(screen, /accessibilityLabel="Email address"/);
  assert.match(screen, /autoComplete="email"/);
  assert.match(screen, /textContentType="emailAddress"/);
  assert.match(screen, /accessibilityRole="button"/);
  assert.match(screen, /accessibilityState=\{\{ disabled: busy \|\| !email\.includes\('@'\), busy \}\}/);
  assert.match(screen, /accessibilityLiveRegion="polite"/);
});

test('onboarding explains consent, local choices and safety limits', () => {
  assert.match(screen, /everyone already in the chat approves/i);
  assert.match(screen, /stay local to your device/i);
  assert.match(screen, /not emergency, medical, legal or crisis support/i);
});

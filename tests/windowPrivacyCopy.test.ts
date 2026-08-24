import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { windowPrivacyCopy } from '../src/i18n/windowPrivacyCopy';

const screen = fs.readFileSync('src/screens/MessageWindowsScreen.tsx', 'utf8');

test('message-window screen explicitly teaches that timezone and schedule are private', () => {
  assert.match(windowPrivacyCopy('en'), /timezone.*private/i);
  assert.match(windowPrivacyCopy('en'), /not shown to other participants/i);
  assert.match(windowPrivacyCopy('da'), /tidszone.*private/i);
  assert.match(windowPrivacyCopy('da'), /vises ikke til andre deltagere/i);
  assert.match(screen, /windowPrivacyCopy\(locale\)/);
});

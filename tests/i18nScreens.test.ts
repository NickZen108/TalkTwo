import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const windowsScreen = fs.readFileSync('src/screens/MessageWindowsScreen.tsx', 'utf8');
const feedbackScreen = fs.readFileSync('src/screens/FeedbackScreen.tsx', 'utf8');

test('message window copy and accessibility labels use the locale catalogue', () => {
  assert.match(windowsScreen, /const \{ t \} = useI18n\(\)/);
  assert.match(windowsScreen, /t\('windows\.timezoneHelp', \{ timezone: deviceTimezone \}\)/);
  assert.match(windowsScreen, /accessibilityLabel=\{t\('windows\.windowLabel', \{ day: name \}\)\}/);
  assert.match(windowsScreen, /accessibilityLabel=\{t\('windows\.saveLabel', \{ day: name \}\)\}/);
  assert.doesNotMatch(windowsScreen, />Message windows</);
  assert.doesNotMatch(windowsScreen, />Use phone timezone</);
});

test('feedback categories, controls and alerts use the locale catalogue', () => {
  assert.match(feedbackScreen, /const \{ t \} = useI18n\(\)/);
  assert.match(feedbackScreen, /labelKey: 'feedback\.bug'/);
  assert.match(feedbackScreen, /placeholder=\{t\('feedback\.placeholder'\)\}/);
  assert.match(feedbackScreen, /Alert\.alert\(t\('feedback\.thankYou'\), t\('feedback\.sent'\)\)/);
  assert.doesNotMatch(feedbackScreen, />Help improve TalkTwo</);
  assert.doesNotMatch(feedbackScreen, />Send feedback</);
});

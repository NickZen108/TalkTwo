import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const windowsScreen = fs.readFileSync('src/screens/MessageWindowsScreen.tsx', 'utf8');
const feedbackScreen = fs.readFileSync('src/screens/FeedbackScreen.tsx', 'utf8');
const chatScreen = fs.readFileSync('src/screens/ChatScreen.tsx', 'utf8');
const homeScreen = fs.readFileSync('src/screens/HomeScreen.tsx', 'utf8');
const giftsScreen = fs.readFileSync('src/screens/PremiumGiftsScreen.tsx', 'utf8');
const settingsScreen = fs.readFileSync('src/screens/ChatSettingsScreen.tsx', 'utf8');

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

test('chat actions, message states and dates use the locale catalogue', () => {
  assert.match(chatScreen, /const \{ locale, t \} = useI18n\(\)/);
  assert.match(chatScreen, /dateLabel\(item\.created_at, locale, t\('chat\.today'\), t\('chat\.yesterday'\)\)/);
  assert.match(chatScreen, /accessibilityLabel=\{t\('chat\.attachDocument'\)\}/);
  assert.match(chatScreen, /t\(isAttachment \? 'chat\.sensitiveDocument' : 'chat\.sensitiveMessage'\)/);
  assert.doesNotMatch(chatScreen, />Try Premium AI review for 7 days</);
  assert.doesNotMatch(chatScreen, />Observer · read only</);
  assert.doesNotMatch(chatScreen, /accessibilityLabel="Send message"/);
});

test('home navigation, recovery and purchase gates use the locale catalogue', () => {
  assert.match(homeScreen, /const \{ t \} = useI18n\(\)/);
  assert.match(homeScreen, /t\('home\.shareKeyBody', \{ name: request\.requester_name, code: request\.verification_code \}\)/);
  assert.match(homeScreen, /t\('home\.extraPaymentBody', \{ access:/);
  assert.match(homeScreen, /accessibilityLabel=\{t\('home\.giftEmailLabel'\)\}/);
  assert.doesNotMatch(homeScreen, />Sign out</);
  assert.doesNotMatch(homeScreen, /title="Manage Premium gifts"/);
  assert.doesNotMatch(homeScreen, /Alert\.alert\('Purchase could not start'/);
});

test('gift recovery and status copy use the locale catalogue', () => {
  assert.match(giftsScreen, /const \{ locale, t \} = useI18n\(\)/);
  assert.match(giftsScreen, /message: t\('gifts\.share', \{ url: link\.url \}\)/);
  assert.match(giftsScreen, /t\(giftStatusKey\(gift\.status\)\)/);
  assert.doesNotMatch(giftsScreen, />Premium gifts</);
  assert.doesNotMatch(giftsScreen, /premiumGiftStatusLabel/);
});

test('chat settings localize safety, payment, boundary and appearance controls', () => {
  assert.match(settingsScreen, /const \{ locale, t \} = useI18n\(\)/);
  assert.match(settingsScreen, /t\('settings\.stopApprovalBody', \{ name: displayName, period \}\)/);
  assert.match(settingsScreen, /t\('settings\.boundaryMaxChars', \{ count: MAX_PERSONAL_BOUNDARY_LENGTH \}\)/);
  assert.match(settingsScreen, /accessibilityLabel=\{t\('settings\.bubbleLabel'/);
  assert.doesNotMatch(settingsScreen, />Chat settings</);
  assert.doesNotMatch(settingsScreen, /title="Invite participant/);
  assert.doesNotMatch(settingsScreen, /Alert\.alert\('Block setting/);
});

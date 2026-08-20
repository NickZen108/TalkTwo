import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const service = fs.readFileSync('src/services/pushNotifications.ts', 'utf8');
const account = fs.readFileSync('src/screens/AccountScreen.tsx', 'utf8');
const auth = fs.readFileSync('src/services/auth.ts', 'utf8');
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));

test('notifications are explicit opt-in and token state stays in SecureStore', () => {
  assert.match(service, /Notifications\.requestPermissionsAsync\(\)/i);
  assert.match(service, /SecureStore\.setItemAsync\(PUSH_TOKEN_KEY/i);
  assert.match(service, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/i);
  assert.match(account, /accessibilityRole="switch"/i);
  assert.match(account, /Alerts never include message text, sender names or document names/i);
});

test('registration requires a physical device and configured EAS project', () => {
  assert.match(service, /if \(!Device\.isDevice\)/i);
  assert.match(service, /Constants\.expoConfig\?\.extra\?\.eas\?\.projectId/i);
  assert.match(service, /getExpoPushTokenAsync\(\{ projectId \}\)/i);
  assert.ok(app.expo.plugins.includes('expo-notifications'));
});

test('sign-out disables the current device and token rotation re-registers', () => {
  assert.match(auth, /disablePushNotifications\(\)[\s\S]*supabase\.auth\.signOut/i);
  assert.match(service, /SecureStore\.deleteItemAsync\(PUSH_TOKEN_KEY[\s\S]*unregisterForNotificationsAsync/i);
  assert.match(service, /addPushTokenListener/i);
  assert.match(service, /next !== existing[\s\S]*disable_push_device/i);
});

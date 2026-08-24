import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { sentDeliveryStatusText } from '../src/i18n/deliveryCopy';

const privacyCard = fs.readFileSync('src/components/PartnerAvailabilityCard.tsx', 'utf8');
const chat = fs.readFileSync('src/screens/ChatScreen.tsx', 'utf8');
const settings = fs.readFileSync('src/screens/ChatSettingsScreen.tsx', 'utf8');
const pushNotifications = fs.readFileSync('src/services/pushNotifications.ts', 'utf8');
const windowsService = fs.readFileSync('src/services/windows.ts', 'utf8');

test('sender delivery copy never reveals rejection state', () => {
  assert.equal(sentDeliveryStatusText(0, 1, 1, 'da'), 'Sendt');
  assert.equal(sentDeliveryStatusText(1, 1, 1, 'da'), 'Leveret');
  assert.equal(sentDeliveryStatusText(0, 1, 1, 'en'), 'Sent');
  assert.equal(sentDeliveryStatusText(1, 1, 1, 'en'), 'Delivered');
});

test('privacy controls do not request partner timezone or availability', () => {
  assert.doesNotMatch(privacyCard, /getPartnerWindows|buildPartnerAvailability|timezone|localTime|differenceMinutes/);
  assert.match(privacyCard, /listMyNotificationMutes/);
  assert.match(privacyCard, /listMyMemberBlocks/);
});

test('participant client API does not expose partner routing metadata', () => {
  assert.doesNotMatch(windowsService, /getPartnerWindows|PartnerWindow|get_relationship_partner_settings/);
  assert.match(windowsService, /getMyTimezone/);
  assert.match(windowsService, /listMyWindows/);
});

test('privacy card exposes requested mute and timed block controls', () => {
  assert.match(privacyCard, /relationshipId, muted/);
  assert.match(privacyCard, /senderId: userId, muted/);
  assert.match(privacyCard, /setBlock\(member\.user_id, 60\)/);
  assert.match(privacyCard, /setBlock\(member\.user_id, 240\)/);
  assert.match(privacyCard, /setBlock\(member\.user_id, 1440\)/);
  assert.match(privacyCard, /setBlock\(member\.user_id, null\)/);
});

test('chat settings use one privacy block control surface', () => {
  assert.match(settings, /<PartnerAvailabilityCard relationshipId=\{relationship\.id\} myUserId=\{session\.user\.id\} \/>/);
  assert.doesNotMatch(settings, /setMemberBlocked|confirmBlock|settings\.blockPerson|settings\.unblockPerson/);
});

test('app-wide notification toggle also controls the account-wide server mute', () => {
  assert.match(pushNotifications, /set_my_notification_mute/);
  assert.match(pushNotifications, /setGlobalNotificationMute\(true\)/);
  assert.match(pushNotifications, /setGlobalNotificationMute\(false\)/);
  assert.match(pushNotifications, /list_my_notification_mutes/);
  assert.match(pushNotifications, /Boolean\(data\) && !globallyMuted/);
});

test('chat never fetches or renders participant timezone metadata', () => {
  assert.doesNotMatch(chat, /getPartnerWindows|partnerTimezone|chat\.timezone/);
  assert.match(chat, /privateConversation/);
});

test('privacy-first chat has no post-send edit or withdrawal controls', () => {
  assert.doesNotMatch(chat, /editUnopenedMessage|withdrawMessage|startEdit|async function withdraw/);
  assert.doesNotMatch(chat, /t\('chat\.edit'\)|t\('chat\.withdraw'\)|t\('chat\.saveEdited'\)/);
  assert.match(chat, /await sendMessage\(relationship\.id, message\.trim\(\)\)/);
});

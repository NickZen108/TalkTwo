import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { sentDeliveryStatusText } from '../src/i18n/deliveryCopy';

const privacyCard = fs.readFileSync('src/components/PartnerAvailabilityCard.tsx', 'utf8');
const chat = fs.readFileSync('src/screens/ChatScreen.tsx', 'utf8');

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

test('privacy card exposes requested mute and timed block controls', () => {
  assert.match(privacyCard, /relationshipId, muted/);
  assert.match(privacyCard, /senderId: userId, muted/);
  assert.match(privacyCard, /setBlock\(member\.user_id, 60\)/);
  assert.match(privacyCard, /setBlock\(member\.user_id, 240\)/);
  assert.match(privacyCard, /setBlock\(member\.user_id, 1440\)/);
  assert.match(privacyCard, /setBlock\(member\.user_id, null\)/);
});

test('chat header cannot deliberately render a partner timezone once server access is removed', () => {
  // Existing legacy fallback may attempt the RPC, but failure must fall back to
  // private-conversation copy. The next cleanup removes even that dead request.
  assert.match(chat, /privateConversation/);
});

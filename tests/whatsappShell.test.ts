import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const home = fs.readFileSync('src/screens/HomeScreen.tsx', 'utf8');
const chat = fs.readFileSync('src/screens/ChatScreen.tsx', 'utf8');
const palette = fs.readFileSync('src/domain/appPalette.ts', 'utf8');
const premiumEdge = fs.readFileSync('supabase/functions/analyze-message/index.ts', 'utf8');

test('home is chat-list first with secondary actions behind an overflow menu', () => {
  assert.match(home, /<Text style=\{styles\.brand\}>TalkTwo<\/Text>/);
  assert.match(home, />⋮<\/Text>/);
  assert.match(home, /styles\.chatList/);
  assert.match(home, /setShowPremium\(true\)/);
  assert.match(home, /setShowFeedback\(true\)/);
  assert.match(home, /setShowFaq\(true\)/);
  assert.match(home, /setShowAccount\(true\)/);
  assert.doesNotMatch(home, /style=\{styles\.tools\}/);
});

test('conversation keeps the message composer below the continuous chat thread', () => {
  const listIndex = chat.indexOf('<FlatList');
  const composerIndex = chat.indexOf('styles.composerWrap');
  const inputIndex = chat.indexOf('<TextInput multiline');
  assert.ok(listIndex >= 0);
  assert.ok(composerIndex > listIndex);
  assert.ok(inputIndex > composerIndex);
});

test('conversation header shows the other participant name and keeps a three-dot menu', () => {
  assert.match(chat, /const title = otherNames/);
  assert.match(chat, /style=\{styles\.headerTitle\}>\{title\}<\/Text>/);
  assert.match(chat, /styles\.settingsGlyph/);
});

test('app palette uses a bank-blue brand rather than the previous green family', () => {
  assert.match(palette, /brand: '#123B5D'/);
  assert.match(palette, /accentStrong: '#124F78'/);
  assert.match(palette, /brand: '#9FD3F2'/);
});

test('Premium edge hard-blocks degrading language before an AI call', () => {
  assert.match(premiumEdge, /dum\(\?:me\)\?/);
  assert.match(premiumEdge, /sindssyg\(\?:e\|t\)\?/);
  assert.match(premiumEdge, /retarderet\(\?:e\)\?/);
  assert.match(premiumEdge, /stupid/);
  assert.match(premiumEdge, /degrading language are not allowed/);
  assert.ok(premiumEdge.indexOf('const hardBlock = hardBlockedFragment(message)') < premiumEdge.indexOf('consume_ai_analysis_for_user'));
});

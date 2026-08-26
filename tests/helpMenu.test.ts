import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const account = fs.readFileSync('src/screens/AccountScreen.tsx', 'utf8');
const faq = fs.readFileSync('src/screens/FAQScreen/index.tsx', 'utf8');

test('account menu exposes Suggest changes and FAQ', () => {
  assert.match(account, /Foreslå ændringer/);
  assert.match(account, /Suggest changes/);
  assert.match(account, /setShowFeedback\(true\)/);
  assert.match(account, /setShowFaq\(true\)/);
  assert.match(account, /<FeedbackScreen/);
  assert.match(account, /<FAQScreen/);
});

test('FAQ covers Free, Premium, privacy and safety basics in Danish and English', () => {
  assert.match(faq, /Hvordan virker gratisversionen\?/);
  assert.match(faq, /How does the Free version work\?/);
  assert.match(faq, /Hvad gør Premium\?/);
  assert.match(faq, /What does Premium do\?/);
  assert.match(faq, /Er blokering privat\?/);
  assert.match(faq, /Is blocking private\?/);
  assert.match(faq, /nød-, læge-, juridisk- eller krisetjeneste/i);
});

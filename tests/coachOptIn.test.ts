import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const edge = fs.readFileSync('supabase/functions/analyze-message/index.ts', 'utf8');
const account = fs.readFileSync('src/screens/AccountScreen.tsx', 'utf8');
const coachCopy = fs.readFileSync('src/i18n/coachCopy.ts', 'utf8');

test('server controls Coach opt-in and cannot let Coach alter message gating', () => {
  assert.match(edge, /select\("resolved_locale,coach_enabled"\)/i);
  assert.match(edge, /const coachEnabled = profile\.coach_enabled === true/i);
  assert.match(edge, /coach_enabled flag controls only whether a rewrite may be offered/i);
  assert.match(edge, /must never change the risk level, sendability, reason, or problematic fragments/i);
  assert.match(edge, /coach_enabled: coachEnabled/i);
  assert.match(edge, /review\.rewrite = coachEnabled && typeof review\.rewrite === "string"/i);
});

test('completed Premium reviews contribute only an aggregate outcome', () => {
  assert.match(edge, /record_coach_review_outcome/i);
  assert.match(edge, /outcome: level/i);
  assert.match(edge, /await recordOutcome\(review\.level as "green" \| "yellow" \| "red"\)/i);
  assert.match(edge, /hardBlock[\s\S]*await recordOutcome\("red"\)/i);
});

test('Account and privacy exposes an explicit Coach switch and own statistics only', () => {
  assert.match(account, /getMyCoachSettings/i);
  assert.match(account, /setMyCoachEnabled/i);
  assert.match(account, /accessibilityRole="switch"[\s\S]*checked: coachEffective/i);
  assert.match(account, /coach\.reviewed_attempts/i);
  assert.match(account, /coach\.blocked_percentage/i);
  assert.match(coachCopy, /aggregate counts, not a history of message text or comparisons with another person/i);
  assert.match(coachCopy, /samlede tal – ikke en historik over beskedtekst og ingen sammenligning med den anden person/i);
});

test('expired Premium pauses Coach and cannot be used to enable it', () => {
  assert.match(account, /coachEffective = Boolean\(coach\?\.enabled && coach\?\.premium_active\)/i);
  assert.match(account, /if \(next && !coach\.premium_active\)/i);
  assert.match(account, /coach\?\.enabled && !coach\.premium_active[\s\S]*coachCopy\.paused/i);
});

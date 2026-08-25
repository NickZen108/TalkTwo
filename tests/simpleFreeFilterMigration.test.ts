import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260825105000_simple_free_filter.sql', 'utf8');

test('server Free filter is mechanical rather than semantic', () => {
  assert.match(migration, /create or replace function public\.free_message_block_reason\(message_body text\)/i);
  assert.match(migration, /Exclamation marks are not allowed/i);
  assert.match(migration, /Profanity or direct insults are not allowed/i);
  assert.match(migration, /Repeated words, letters or punctuation are not allowed/i);
  assert.match(migration, /capital letters are not allowed/i);
  assert.doesNotMatch(migration, /Generalisations such as always or never/i);
  assert.doesNotMatch(migration, /Unnecessary reminders of past faults/i);
  assert.doesNotMatch(migration, /Criticism or blame is not allowed/i);
  assert.doesNotMatch(migration, /Emotional processing is not allowed/i);
});

test('simple server rules retain Unicode canonicalization and raw emoji checks', () => {
  assert.match(migration, /normalize\(clean, NFKC\)/i);
  assert.match(migration, /chr\(8203\)\s*\|\|\s*'-'\s*\|\|\s*chr\(8207\)/i);
  assert.match(migration, /if clean ~ '\[😀-🙏🌀-🫿☀-➿\]'/i);
});

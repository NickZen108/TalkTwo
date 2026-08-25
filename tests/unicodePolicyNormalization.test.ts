import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { normalizePolicyText } from '../src/domain/policyText';

const migrationPath = 'supabase/migrations/20260825100000_unicode_policy_canonicalization.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');

test('client policy text applies NFKC and removes invisible controls', () => {
  assert.equal(normalizePolicyText('a\u200Blways'), 'always');
  assert.equal(normalizePolicyText('ne\u202Ever'), 'never');
  assert.equal(normalizePolicyText('Pickup！'), 'Pickup!');
});

test('server migration canonicalizes the policy surfaces that can gate content', () => {
  assert.match(migration, /create or replace function public\.normalize_personal_boundary\(value text\)/i);
  assert.match(migration, /create or replace function public\.free_message_block_reason\(message_body text\)/i);
  assert.match(migration, /create or replace function public\.symbolic_tone_block_reason\(message_body text\)/i);
  assert.match(migration, /create or replace function public\.safe_public_display_name\(candidate text\)/i);
  assert.match(migration, /normalize\([^;]+NFKC\)/i);
  assert.match(migration, /chr\(8203\)\s*\|\|\s*'-'\s*\|\|\s*chr\(8207\)/i);
  assert.match(migration, /chr\(8234\)\s*\|\|\s*'-'\s*\|\|\s*chr\(8238\)/i);
  assert.match(migration, /chr\(917760\)\s*\|\|\s*'-'\s*\|\|\s*chr\(917999\)/i);
});

test('raw emoji is checked before canonical formatting marks are removed', () => {
  const free = migration.match(/create or replace function public\.free_message_block_reason[\s\S]*?end;\n\$\$;/i)?.[0] ?? '';
  const rawEmoji = free.indexOf("if clean ~ '[😀-🙏🌀-🫿☀-➿]'");
  const semanticProfanity = free.indexOf("if m ~ '(^|[^[:alpha:]])(fuck");
  assert.ok(rawEmoji >= 0, 'raw emoji check is required');
  assert.ok(semanticProfanity > rawEmoji, 'semantic checks must use the canonical policy form after raw emoji detection');
});

test('existing obfuscated essential boundaries are removed before reindexing', () => {
  assert.match(migration, /drop index if exists public\.personal_boundaries_user_relationship_normalized_idx/i);
  assert.match(migration, /delete from public\.personal_boundaries pb[\s\S]*normalize_personal_boundary\(pb\.word\)[\s\S]*'school'[\s\S]*'skole'/i);
  assert.match(migration, /update public\.personal_boundaries pb[\s\S]*set normalized_phrase = public\.normalize_personal_boundary\(pb\.word\)/i);
  assert.match(migration, /row_number\(\) over[\s\S]*partition by user_id, relationship_id, normalized_phrase/i);
  assert.match(migration, /create unique index personal_boundaries_user_relationship_normalized_idx/i);
});

test('policy canonicalization does not introduce a new public helper RPC', () => {
  assert.doesNotMatch(migration, /create or replace function public\.normalize_policy_text/i);
  assert.match(migration, /revoke execute on function public\.normalize_personal_boundary\(text\) from public, anon, authenticated, service_role/i);
});

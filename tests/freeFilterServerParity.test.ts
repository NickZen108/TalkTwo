import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const clientFilter = fs.readFileSync('src/filter/freeFilter.ts', 'utf8');
const serverMigration = fs.readFileSync('supabase/migrations/20260825105500_free_filter_degrading_language.sql', 'utf8');

const degradingWords = [
  'dumb', 'stupid', 'crazy', 'insane', 'retard', 'retarded', 'pathetic', 'useless', 'incompetent', 'ridiculous',
  'dum', 'dumme', 'sindssyg', 'sindssygt', 'sindssyge', 'retarderet', 'retarderede', 'patetisk', 'patetiske',
  'ubrukelig', 'ubrugelig', 'ubrugelige', 'inkompetent', 'inkompetente', 'latterlig', 'latterligt', 'latterlige',
];

test('Free degrading-language vocabulary is enforced on both client and server', () => {
  for (const word of degradingWords) {
    assert.ok(clientFilter.includes(`'${word}'`), `client Free filter is missing ${word}`);
    assert.match(serverMigration, new RegExp(`(^|\\|)${word}(\\||\\))`), `server Free filter is missing ${word}`);
  }
  assert.match(serverMigration, /create or replace function public\.free_message_block_reason/);
  assert.match(serverMigration, /degrading language are not allowed/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const localDb = fs.readFileSync('src/services/localDb.ts', 'utf8');

test('native app config requires SQLCipher and disables Android app-data backup', () => {
  const sqlitePlugin = (app?.expo?.plugins ?? []).find(
    (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-sqlite',
  );
  assert.equal(sqlitePlugin?.[1]?.useSQLCipher, true);
  assert.equal(app?.expo?.android?.allowBackup, false);
});

test('local database key is device-only random 256-bit material', () => {
  assert.match(localDb, /getRandomBytesAsync\(32\)/);
  assert.match(localDb, /\^\[0-9a-f\]\{64\}\$\/i/);
  assert.match(localDb, /SecureStore\.WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
});

test('database fails closed unless SQLCipher responds before any plaintext table access', () => {
  const keyPosition = localDb.indexOf('PRAGMA key');
  const cipherVersionPosition = localDb.indexOf('PRAGMA cipher_version');
  const firstTablePosition = localDb.indexOf('CREATE TABLE');

  assert.ok(keyPosition >= 0, 'database key pragma is required');
  assert.ok(cipherVersionPosition > keyPosition, 'SQLCipher must be verified after applying the key');
  assert.ok(firstTablePosition > cipherVersionPosition, 'SQLCipher must be verified before table access');
  assert.match(localDb, /if \(!row\?\.cipher_version\?\.trim\(\)\)/);
  assert.match(localDb, /await db\.closeAsync\(\)/);
  assert.match(localDb, /throw new Error\('Encrypted local storage is unavailable on this build\.'\)/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const localDb = fs.readFileSync('src/services/localDb.ts', 'utf8');
const androidGate = fs.readFileSync('scripts/check-android-permissions.mjs', 'utf8');

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
  assert.match(localDb, /throw new Error\('Encrypted local storage is unavailable on this build\.'\)/);
});

test('database proves the key can read the file header before schema writes', () => {
  const keyPosition = localDb.indexOf('PRAGMA key');
  const headerProbePosition = localDb.indexOf('SELECT count(*) AS count FROM sqlite_master');
  const firstTablePosition = localDb.indexOf('CREATE TABLE');
  assert.ok(headerProbePosition > keyPosition);
  assert.ok(firstTablePosition > headerProbePosition);
});

test('orphaned encrypted cache is discarded only when this device just created a replacement key', () => {
  assert.match(localDb, /return \{ key: stored, created: false \}/);
  assert.match(localDb, /return \{ key: created, created: true \}/);
  assert.match(localDb, /if \(!keyState\.created \|\|/);
  assert.match(localDb, /SQLite\.deleteDatabaseAsync\(DB_NAME\)/);
  assert.match(localDb, /OEM D2D migration/i);
  assert.match(localDb, /rebuild from authorized server sync/i);
});

test('Android prebuild and merged-manifest gate require backup to remain explicitly disabled', () => {
  assert.match(androidGate, /android:allowBackup/);
  assert.match(androidGate, /allowBackup !== 'false'/);
  assert.match(androidGate, /must be explicitly false for TalkTwo private app data/i);
  assert.match(androidGate, /merged_manifests/i);
});

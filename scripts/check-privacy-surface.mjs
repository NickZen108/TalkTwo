import fs from 'node:fs';
import path from 'node:path';

const roots = ['App.tsx', 'src'];
const forbiddenImports = [
  '@react-native-async-storage/async-storage',
  'expo-camera',
  'expo-contacts',
  'expo-location',
  'expo-media-library',
  'expo-image-picker',
  'expo-av',
  'expo-audio',
  'react-native-contacts',
  'react-native-image-picker',
  'react-native-permissions',
];

const forbiddenPermissionStrings = [
  'requestCameraPermissions',
  'requestMicrophonePermissions',
  'requestForegroundPermissions',
  'requestBackgroundPermissions',
  'requestMediaLibraryPermissions',
  'requestContactsPermissions',
];

function walk(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target).flatMap((entry) => walk(path.join(target, entry)));
}

const files = roots.flatMap((root) => walk(root)).filter((file) => /\.(ts|tsx|js|mjs)$/.test(file));
const failures = [];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const moduleName of forbiddenImports) {
    if (source.includes(`'${moduleName}'`) || source.includes(`\"${moduleName}\"`)) failures.push(`${file}: imports ${moduleName}`);
  }
  for (const marker of forbiddenPermissionStrings) {
    if (source.includes(marker)) failures.push(`${file}: contains permission request ${marker}`);
  }
}

const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const android = app?.expo?.android ?? {};
if (Array.isArray(android.permissions) && android.permissions.length > 0) {
  failures.push(`app.json: explicit Android permissions should stay empty until a feature genuinely requires one (${android.permissions.join(', ')})`);
}
if (android.allowBackup !== false) {
  failures.push('app.json: Android app-data backup must remain disabled for the encrypted local message cache and device-only secrets');
}

const sqlitePlugin = (app?.expo?.plugins ?? []).find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-sqlite',
);
if (!sqlitePlugin || sqlitePlugin[1]?.useSQLCipher !== true) {
  failures.push('app.json: expo-sqlite must keep useSQLCipher=true so PRAGMA key is backed by SQLCipher');
}

const localDb = fs.readFileSync('src/services/localDb.ts', 'utf8');
const keyPosition = localDb.indexOf('PRAGMA key');
const cipherVersionPosition = localDb.indexOf('PRAGMA cipher_version');
const firstTablePosition = localDb.indexOf('CREATE TABLE');
if (keyPosition < 0 || cipherVersionPosition < 0 || firstTablePosition < 0
  || !(keyPosition < cipherVersionPosition && cipherVersionPosition < firstTablePosition)) {
  failures.push('src/services/localDb.ts: local DB must apply its key, verify SQLCipher, then access/create plaintext tables');
}
if (!/Encrypted local storage is unavailable on this build/.test(localDb)) {
  failures.push('src/services/localDb.ts: SQLCipher verification must fail closed instead of silently using plain SQLite');
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (packageJson.dependencies?.['@react-native-async-storage/async-storage']) {
  failures.push('package.json: AsyncStorage is not allowed; sensitive persistent state must use SecureStore or SQLCipher');
}
if (!packageJson.dependencies?.['expo-secure-store']) failures.push('package.json: expo-secure-store must remain installed for keys, auth session and invitation secrets');
if (!packageJson.dependencies?.['expo-sqlite']) failures.push('package.json: expo-sqlite must remain installed for the encrypted local message cache');

if (failures.length) {
  console.error('Privacy surface gate failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Privacy surface gate passed. Sensitive Android backups are disabled; SecureStore and fail-closed SQLCipher remain required.');

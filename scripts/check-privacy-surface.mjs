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

console.log('Privacy surface gate passed. No invasive permission code or unencrypted AsyncStorage is present; SecureStore and SQLCipher remain required.');

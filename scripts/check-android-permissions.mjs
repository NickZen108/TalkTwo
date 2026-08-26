import fs from 'node:fs';
import path from 'node:path';

const forbidden = new Set([
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.ACCESS_MEDIA_LOCATION',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.GET_ACCOUNTS',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.READ_PHONE_STATE',
  'android.permission.READ_PHONE_NUMBERS',
  'android.permission.CALL_PHONE',
  'android.permission.READ_CALL_LOG',
  'android.permission.WRITE_CALL_LOG',
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.SEND_SMS',
  'android.permission.ACTIVITY_RECOGNITION',
  'android.permission.BODY_SENSORS',
  'android.permission.BODY_SENSORS_BACKGROUND',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.BLUETOOTH_ADVERTISE',
  'android.permission.NEARBY_WIFI_DEVICES',
  'android.permission.SYSTEM_ALERT_WINDOW',
]);

function manifestsUnder(root) {
  if (!fs.existsSync(root)) return [];
  const stat = fs.statSync(root);
  if (stat.isFile()) return path.basename(root) === 'AndroidManifest.xml' ? [root] : [];
  return fs.readdirSync(root).flatMap((entry) => manifestsUnder(path.join(root, entry)));
}

function checkManifest(manifestPath, expectRemovalDirectives) {
  const xml = fs.readFileSync(manifestPath, 'utf8');
  const tags = [...xml.matchAll(/<uses-permission(?:-sdk-23)?\b[^>]*\/?>/g)].map((match) => match[0]);
  const entries = tags.map((tag) => {
    const name = tag.match(/android:name="([^"]+)"/)?.[1] ?? '';
    const nodeAction = tag.match(/tools:node="([^"]+)"/)?.[1] ?? '';
    return { name, removed: nodeAction.toLowerCase() === 'remove' };
  }).filter((entry) => entry.name);

  const active = [...new Set(entries.filter((entry) => !entry.removed).map((entry) => entry.name))].sort();
  const removed = [...new Set(entries.filter((entry) => entry.removed).map((entry) => entry.name))].sort();
  const sensitive = active.filter((permission) => forbidden.has(permission));
  const applicationTag = xml.match(/<application\b[^>]*>/i)?.[0] ?? '';
  const allowBackup = applicationTag.match(/android:allowBackup="([^"]+)"/i)?.[1]?.toLowerCase() ?? '';

  console.log(`${manifestPath}: active permissions = ${active.length ? active.join(', ') : '(none)'}`);
  console.log(`${manifestPath}: android:allowBackup = ${allowBackup || '(missing/default true)'}`);
  if (expectRemovalDirectives) console.log(`${manifestPath}: explicit removal directives = ${removed.length ? removed.join(', ') : '(none)'}`);

  const failures = [];
  if (!active.includes('android.permission.INTERNET')) failures.push(`${manifestPath}: INTERNET permission is missing`);
  if (sensitive.length) failures.push(`${manifestPath}: sensitive permissions are ACTIVE: ${sensitive.join(', ')}`);
  if (allowBackup !== 'false') failures.push(`${manifestPath}: android:allowBackup must be explicitly false for TalkTwo private app data`);
  return failures;
}

const mergedMode = process.argv.includes('--merged');
const buildVariant = process.argv.includes('--release') ? 'release' : 'debug';
const variantPattern = new RegExp(`(?:^|[\\\\/])${buildVariant}(?:[\\\\/]|$)`, 'i');
const paths = mergedMode
  ? manifestsUnder('android/app/build/intermediates/merged_manifests').filter((item) => variantPattern.test(item))
  : ['android/app/src/main/AndroidManifest.xml'];

if (!paths.length || paths.some((item) => !fs.existsSync(item))) {
  console.error(mergedMode
    ? `No merged ${buildVariant} AndroidManifest.xml found. Build the Android ${buildVariant} app first.`
    : 'Missing android/app/src/main/AndroidManifest.xml. Run Expo prebuild first.');
  process.exit(1);
}

const failures = paths.flatMap((manifestPath) => checkManifest(manifestPath, !mergedMode));
if (failures.length) {
  console.error('Android privacy/permission gate failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log(`${mergedMode ? 'Merged Android' : 'Prebuild Android'} privacy/permission gate passed.`);

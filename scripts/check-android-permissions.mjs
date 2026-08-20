import fs from 'node:fs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
if (!fs.existsSync(manifestPath)) {
  console.error(`Missing ${manifestPath}. Run Expo prebuild first.`);
  process.exit(1);
}

const xml = fs.readFileSync(manifestPath, 'utf8');
const tags = [...xml.matchAll(/<uses-permission(?:-sdk-23)?\b[^>]*\/?>/g)].map((match) => match[0]);
const entries = tags.map((tag) => {
  const name = tag.match(/android:name="([^"]+)"/)?.[1] ?? '';
  const nodeAction = tag.match(/tools:node="([^"]+)"/)?.[1] ?? '';
  return { name, removed: nodeAction.toLowerCase() === 'remove', tag };
}).filter((entry) => entry.name);

const activePermissions = [...new Set(entries.filter((entry) => !entry.removed).map((entry) => entry.name))].sort();
const explicitlyRemoved = [...new Set(entries.filter((entry) => entry.removed).map((entry) => entry.name))].sort();

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

const foundForbidden = activePermissions.filter((permission) => forbidden.has(permission));
console.log(`Active Android permissions: ${activePermissions.length ? activePermissions.join(', ') : '(none)'}`);
console.log(`Explicitly removed permissions: ${explicitlyRemoved.length ? explicitlyRemoved.join(', ') : '(none)'}`);

if (!activePermissions.includes('android.permission.INTERNET')) {
  console.error('Expected INTERNET permission is missing; TalkTwo cannot function without network access.');
  process.exit(1);
}
if (foundForbidden.length) {
  console.error(`Sensitive permissions are ACTIVE in the generated manifest: ${foundForbidden.join(', ')}`);
  process.exit(1);
}

console.log('Android sensitive-permission gate passed. Removal directives are not counted as active permissions.');

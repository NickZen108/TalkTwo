import fs from 'node:fs';

const errors = [];
const app = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo ?? {};
const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));

function fail(message) {
  errors.push(message);
}

function validHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
const publicSiteUrl = process.env.EXPO_PUBLIC_TALKTWO_SITE_URL?.trim() ?? '';

if (!validHttps(supabaseUrl)) fail('EXPO_PUBLIC_SUPABASE_URL must be a valid HTTPS URL.');
if (!publishableKey || /replace|service[_-]?role/i.test(publishableKey)) {
  fail('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a real publishable key and never a service-role key.');
}
if (!validHttps(publicSiteUrl)) {
  fail('EXPO_PUBLIC_TALKTWO_SITE_URL must be the final live HTTPS public site before release.');
}

if (app.name !== 'TalkTwo') fail('Expo app name must remain TalkTwo.');
if (!present(app.version)) fail('Expo user-facing version is required.');
if (app.ios?.bundleIdentifier !== 'com.talktwo.app') fail('iOS bundle identifier must be com.talktwo.app.');
if (app.android?.package !== 'com.talktwo.app') fail('Android package must be com.talktwo.app.');

const androidProps = app.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties')?.[1]?.android;
if (!androidProps || Number(androidProps.compileSdkVersion) < 36 || Number(androidProps.targetSdkVersion) < 36) {
  fail('Android compile/target SDK must remain API 36 or newer.');
}

if (eas.cli?.appVersionSource !== 'remote' || eas.build?.production?.autoIncrement !== true) {
  fail('EAS production versioning must use remote app versions with autoIncrement=true.');
}

if (!present(app.icon)) fail('Final Expo app icon asset is required.');
if (!present(app.android?.adaptiveIcon?.foregroundImage)) fail('Final Android adaptive icon foreground asset is required.');
if (!present(app.android?.adaptiveIcon?.backgroundColor)) fail('Android adaptive icon background colour is required.');

const projectId = app.extra?.eas?.projectId ?? process.env.EAS_PROJECT_ID;
if (!present(projectId)) {
  fail('An EAS project ID is required before production push notifications/builds are released.');
}

if (errors.length) {
  console.error('TalkTwo release preflight failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('TalkTwo release preflight OK.');

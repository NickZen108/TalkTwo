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
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && Boolean(url.hostname)
      && !url.username && !url.password
      && !url.port
      && url.pathname === '/'
      && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validSupabasePublishableKey(value) {
  return /^sb_publishable_[A-Za-z0-9_-]+$/.test(value);
}

function sameHostVerifiedAndroidLink(filter, host) {
  if (!filter || filter.action !== 'VIEW' || filter.autoVerify !== true) return false;
  const categories = Array.isArray(filter.category) ? filter.category : [];
  if (!categories.includes('BROWSABLE') || !categories.includes('DEFAULT')) return false;
  const data = Array.isArray(filter.data) ? filter.data : [];
  return data.some((entry) => entry?.scheme === 'https' && entry?.host === host && entry?.pathPrefix === '/app/');
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
const publicSiteUrl = process.env.EXPO_PUBLIC_TALKTWO_SITE_URL?.trim() ?? '';

if (!validHttps(supabaseUrl)) fail('EXPO_PUBLIC_SUPABASE_URL must be a valid HTTPS URL.');
if (!validSupabasePublishableKey(publishableKey)) {
  fail('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a current sb_publishable_ key; secret and legacy service-role keys are forbidden in the mobile client.');
}
if (!validHttpsOrigin(publicSiteUrl)) {
  fail('EXPO_PUBLIC_TALKTWO_SITE_URL must be the final live HTTPS origin only (for example https://example.com), with no credentials, custom port, path, query or fragment.');
}

let publicSiteHost = '';
if (validHttpsOrigin(publicSiteUrl)) publicSiteHost = new URL(publicSiteUrl).hostname;

if (app.name !== 'TalkTwo') fail('Expo app name must remain TalkTwo.');
if (!present(app.version)) fail('Expo user-facing version is required.');
if (app.ios?.bundleIdentifier !== 'com.talktwo.app') fail('iOS bundle identifier must be com.talktwo.app.');
if (app.android?.package !== 'com.talktwo.app') fail('Android package must be com.talktwo.app.');

if (publicSiteHost) {
  const associatedDomains = Array.isArray(app.ios?.associatedDomains) ? app.ios.associatedDomains : [];
  if (!associatedDomains.includes(`applinks:${publicSiteHost}`)) {
    fail(`iOS production config must include applinks:${publicSiteHost}; custom URL schemes alone are not sufficient for auth/invitation/recovery secrets.`);
  }
  const intentFilters = Array.isArray(app.android?.intentFilters) ? app.android.intentFilters : [];
  if (!intentFilters.some((filter) => sameHostVerifiedAndroidLink(filter, publicSiteHost))) {
    fail(`Android production config must include an autoVerify HTTPS App Link for https://${publicSiteHost}/app/; custom URL schemes alone are not sufficient for auth/invitation/recovery secrets.`);
  }
}

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

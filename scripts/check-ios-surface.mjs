import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing ${relativePath}; run the iOS Expo prebuild first.`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

const appConfig = JSON.parse(read('app.json') || '{}').expo ?? {};
const infoPlist = read('ios/TalkTwo/Info.plist');
const podPropertiesText = read('ios/Podfile.properties.json');
const xcodeProject = read('ios/TalkTwo.xcodeproj/project.pbxproj');
const entitlements = read('ios/TalkTwo/TalkTwo.entitlements');

const forbiddenUsageDescriptions = [
  'NSBluetoothAlwaysUsageDescription',
  'NSCalendarsFullAccessUsageDescription',
  'NSCalendarsUsageDescription',
  'NSCameraUsageDescription',
  'NSContactsUsageDescription',
  'NSHealthShareUsageDescription',
  'NSHealthUpdateUsageDescription',
  'NSLocationAlwaysAndWhenInUseUsageDescription',
  'NSLocationAlwaysUsageDescription',
  'NSLocationWhenInUseUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSMotionUsageDescription',
  'NSPhotoLibraryAddUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSRemindersFullAccessUsageDescription',
  'NSRemindersUsageDescription',
  'NSSpeechRecognitionUsageDescription',
];

const configuredInfoPlist = appConfig.ios?.infoPlist ?? {};
for (const key of forbiddenUsageDescriptions) {
  if (key in configuredInfoPlist) failures.push(`app.json configures forbidden iOS permission key ${key}.`);
  if (new RegExp(`<key>\\s*${key}\\s*</key>`).test(infoPlist)) failures.push(`Generated Info.plist contains forbidden iOS permission key ${key}.`);
}

if (appConfig.ios?.bundleIdentifier !== 'com.talktwo.app') failures.push('The configured iOS bundle identifier must remain com.talktwo.app.');
if (!/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*"?com\.talktwo\.app"?;/.test(xcodeProject)) failures.push('The generated Xcode project has an unexpected bundle identifier.');
if (!/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*16\.4;/.test(xcodeProject)) failures.push('The generated Xcode project must target iOS 16.4 or newer.');

let podProperties = {};
try {
  podProperties = JSON.parse(podPropertiesText || '{}');
} catch {
  failures.push('ios/Podfile.properties.json is not valid JSON.');
}
if (podProperties['ios.deploymentTarget'] !== '16.4') failures.push('The CocoaPods deployment target must remain iOS 16.4.');
if (podProperties['expo.sqlite.useSQLCipher'] !== 'true') failures.push('The generated iOS project must keep SQLCipher enabled.');
if (podProperties['apple.privacyManifestAggregationEnabled'] !== 'true') {
  failures.push('Apple privacy-manifest aggregation must remain enabled.');
}

if (!/<key>\s*UIUserInterfaceStyle\s*<\/key>\s*<string>\s*Automatic\s*<\/string>/.test(infoPlist)) failures.push('The generated iOS app must support automatic light/dark appearance.');
if (!/<string>\s*talktwo\s*<\/string>/.test(infoPlist)) failures.push('The generated iOS app is missing the talktwo URL scheme.');
if (/<key>\s*NSAllowsArbitraryLoads\s*<\/key>\s*<true\s*\/>/.test(infoPlist)) failures.push('The generated iOS app must not allow arbitrary network loads.');

const forbiddenEntitlements = [
  'com.apple.developer.healthkit',
  'com.apple.developer.homekit',
  'com.apple.developer.networking.HotspotConfiguration',
  'com.apple.developer.siri',
];
for (const entitlement of forbiddenEntitlements) {
  if (entitlements.includes(entitlement)) failures.push(`Generated entitlements include unexpected capability ${entitlement}.`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('iOS surface gate passed. Native identifiers, iOS 16.4, SQLCipher, dark mode, deep linking and privacy boundaries are intact.');

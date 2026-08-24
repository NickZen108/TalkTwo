import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));

function androidBuildProperties() {
  const plugin = app.expo.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === 'expo-build-properties');
  assert.ok(Array.isArray(plugin), 'expo-build-properties must be configured');
  const config = plugin[1] as { android?: { compileSdkVersion?: number; targetSdkVersion?: number } } | undefined;
  assert.ok(config?.android, 'Android build properties must be configured');
  return config.android;
}

test('Android compile and target SDK are explicitly pinned to API 36 or newer', () => {
  const android = androidBuildProperties();
  assert.ok((android.compileSdkVersion ?? 0) >= 36, 'compileSdkVersion must be API 36 or newer');
  assert.ok((android.targetSdkVersion ?? 0) >= 36, 'targetSdkVersion must be API 36 or newer');
});

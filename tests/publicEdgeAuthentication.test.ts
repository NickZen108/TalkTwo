import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const config = fs.readFileSync('supabase/config.toml', 'utf8');
const apple = fs.readFileSync('supabase/functions/apple-store-events/index.ts', 'utf8');
const appleShared = fs.readFileSync('supabase/functions/_shared/apple.ts', 'utf8');
const google = fs.readFileSync('supabase/functions/google-store-events/index.ts', 'utf8');
const googleShared = fs.readFileSync('supabase/functions/_shared/google.ts', 'utf8');
const push = fs.readFileSync('supabase/functions/dispatch-push-notifications/index.ts', 'utf8');

test('non-JWT Apple webhook still cryptographically verifies App Store signed data', () => {
  assert.match(config, /\[functions\.apple-store-events\][\s\S]*?verify_jwt\s*=\s*false/i);
  assert.match(apple, /verifyAndDecodeNotification\(signedPayload\)/i);
  assert.match(appleShared, /new SignedDataVerifier\(/i);
  assert.match(appleShared, /APPLE_ROOT_CA_DER_BASE64_JSON/i);
  assert.match(appleShared, /APPLE_BUNDLE_ID/i);
});

test('non-JWT Google webhook verifies Pub\/Sub identity before parsing purchase events', () => {
  assert.match(config, /\[functions\.google-store-events\][\s\S]*?verify_jwt\s*=\s*false/i);
  assert.match(google, /await verifyGooglePubSubRequest\(req\)/i);
  assert.match(googleShared, /verifyIdToken\(\{\s*idToken,\s*audience\s*\}\)/i);
  assert.match(googleShared, /payload\?\.email_verified/i);
  assert.match(googleShared, /GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL/i);
  assert.match(google, /verifyGooglePackageName\(envelope\.packageName\)/i);
});

test('non-JWT push dispatcher requires its own bearer secret before service-role work', () => {
  assert.match(config, /\[functions\.dispatch-push-notifications\][\s\S]*?verify_jwt\s*=\s*false/i);
  assert.match(push, /PUSH_DISPATCH_SECRET/i);
  assert.match(push, /if \(!await authorized\(req, dispatchSecret\)\)/i);
  assert.match(push, /return json\(\{ error: "Unauthorized" \}, 401\)/i);
});

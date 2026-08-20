import { GoogleAuth, OAuth2Client } from 'npm:google-auth-library@10.5.0';

import { requiredEnv } from './http.ts';

const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export async function verifyGooglePubSubRequest(req: Request) {
  const authorization = req.headers.get('authorization');
  const idToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!idToken) throw new Error('Google Pub/Sub bearer token is required.');

  const audience = requiredEnv('GOOGLE_PUBSUB_AUDIENCE');
  const expectedEmail = requiredEnv('GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL').toLowerCase();
  const ticket = await new OAuth2Client().verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();
  if (!payload?.email_verified || payload.email?.toLowerCase() !== expectedEmail) {
    throw new Error('Google Pub/Sub identity mismatch.');
  }
}

async function googleAccessToken() {
  const credentials = JSON.parse(requiredEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON')) as Record<string, unknown>;
  const auth = new GoogleAuth({ credentials, scopes: [ANDROID_PUBLISHER_SCOPE] });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  const token = typeof accessToken === 'string' ? accessToken : accessToken?.token;
  if (!token) throw new Error('Google Play access token could not be created.');
  return token;
}

async function googlePlayGet(path: string) {
  const response = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/${path}`, {
    headers: {
      authorization: `Bearer ${await googleAccessToken()}`,
      accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Google Play verification failed (${response.status}).`);
  return await response.json() as unknown;
}

export function verifyGooglePackageName(packageName: string) {
  if (packageName !== requiredEnv('GOOGLE_PACKAGE_NAME')) throw new Error('Google package name mismatch.');
}

export function getGoogleSubscription(purchaseToken: string) {
  const packageName = requiredEnv('GOOGLE_PACKAGE_NAME');
  return googlePlayGet(
    `applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
  );
}

export function getGoogleOneTimePurchase(purchaseToken: string) {
  const packageName = requiredEnv('GOOGLE_PACKAGE_NAME');
  return googlePlayGet(
    `applications/${encodeURIComponent(packageName)}/purchases/productsv2/tokens/${encodeURIComponent(purchaseToken)}`,
  );
}

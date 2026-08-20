import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  getRandomBytesAsync,
} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const THREAD_PREFIX = 'talktwo.threadkey.';
const PENDING_TOKEN_PREFIX = 'talktwo.invite-secret.token.';
const PENDING_INVITATION_PREFIX = 'talktwo.invite-secret.id.';
const KEY_PATTERN = /^[0-9a-f]{64}$/i;
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function assertKey(key: string) {
  if (!KEY_PATTERN.test(key)) throw new Error('The secure key is invalid.');
  return key.toLowerCase();
}

function envelopeAad(token: string) {
  return encoder.encode(`talktwo-key-envelope-v1:${token.trim()}`);
}

export async function getThreadKey(relationshipId: string) {
  const key = await SecureStore.getItemAsync(`${THREAD_PREFIX}${relationshipId}`, secureOptions);
  return key ? assertKey(key) : null;
}

export async function storeThreadKey(relationshipId: string, key: string) {
  await SecureStore.setItemAsync(`${THREAD_PREFIX}${relationshipId}`, assertKey(key), secureOptions);
}

export async function ensureThreadKey(relationshipId: string) {
  const existing = await getThreadKey(relationshipId);
  if (existing) return existing;
  const generated = bytesToHex(await getRandomBytesAsync(32));
  await storeThreadKey(relationshipId, generated);
  return generated;
}

export async function createInvitationEnvelope(token: string, threadKey: string) {
  const secret = bytesToHex(await getRandomBytesAsync(32));
  const wrappingKey = await AESEncryptionKey.import(secret, 'hex');
  const sealed = await aesEncryptAsync(encoder.encode(assertKey(threadKey)), wrappingKey, { additionalData: envelopeAad(token) });
  return { secret, envelope: await sealed.combined('base64') };
}

export async function openInvitationEnvelope(token: string, secret: string, envelope: string) {
  const wrappingKey = await AESEncryptionKey.import(assertKey(secret), 'hex');
  const sealed = AESSealedData.fromCombined(envelope);
  const decrypted = await aesDecryptAsync(sealed, wrappingKey, { additionalData: envelopeAad(token), output: 'bytes' });
  return assertKey(decoder.decode(decrypted as Uint8Array).trim());
}

export async function storePendingInviteSecret(token: string, secret: string) {
  await SecureStore.setItemAsync(`${PENDING_TOKEN_PREFIX}${token}`, assertKey(secret), secureOptions);
}

export async function getPendingInviteSecret(token: string) {
  const secret = await SecureStore.getItemAsync(`${PENDING_TOKEN_PREFIX}${token}`, secureOptions);
  return secret ? assertKey(secret) : null;
}

export async function consumeInitialInviteEnvelope(token: string, relationshipId: string, envelope: string) {
  const pendingName = `${PENDING_TOKEN_PREFIX}${token}`;
  const secret = await SecureStore.getItemAsync(pendingName, secureOptions);
  if (!secret) throw new Error('This invitation is missing its one-time encryption secret. Ask the sender for a new invitation.');
  const threadKey = await openInvitationEnvelope(token, secret, envelope);
  await storeThreadKey(relationshipId, threadKey);
  await SecureStore.deleteItemAsync(pendingName, secureOptions);
  return threadKey;
}

export async function bindPendingMemberInviteSecret(token: string, invitationId: string) {
  const tokenName = `${PENDING_TOKEN_PREFIX}${token}`;
  const secret = await SecureStore.getItemAsync(tokenName, secureOptions);
  if (!secret) throw new Error('This invitation is missing its one-time encryption secret. Ask the sender for a new invitation.');
  await SecureStore.setItemAsync(
    `${PENDING_INVITATION_PREFIX}${invitationId}`,
    JSON.stringify({ token: token.trim(), secret: assertKey(secret) }),
    secureOptions,
  );
  await SecureStore.deleteItemAsync(tokenName, secureOptions);
}

export async function installActiveMemberEnvelope(invitationId: string, relationshipId: string, envelope: string) {
  const pendingName = `${PENDING_INVITATION_PREFIX}${invitationId}`;
  const stored = await SecureStore.getItemAsync(pendingName, secureOptions);
  if (!stored) return false;
  let parsed: { token: string; secret: string };
  try {
    parsed = JSON.parse(stored) as { token: string; secret: string };
  } catch {
    throw new Error('The pending invitation encryption data is damaged. Ask a current member to send a recovery invitation.');
  }
  if (!parsed.token || !parsed.secret) throw new Error('The pending invitation encryption data is incomplete.');
  const threadKey = await openInvitationEnvelope(parsed.token, parsed.secret, envelope);
  await storeThreadKey(relationshipId, threadKey);
  await SecureStore.deleteItemAsync(pendingName, secureOptions);
  return true;
}

export async function removeThreadKeys(relationshipIds: string[]) {
  await Promise.all(
    [...new Set(relationshipIds)]
      .filter(Boolean)
      .map((relationshipId) => SecureStore.deleteItemAsync(`${THREAD_PREFIX}${relationshipId}`, secureOptions)),
  );
}

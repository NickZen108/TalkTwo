import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const THREAD_PREFIX = 'talktwo.threadkey.';
const PENDING_PREFIX = 'talktwo.pendingkey.';
const KEY_PATTERN = /^[0-9a-f]{64}$/i;
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function assertKey(key: string) {
  if (!KEY_PATTERN.test(key)) throw new Error('The secure conversation key is invalid.');
  return key.toLowerCase();
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
  const generated = bytesToHex(await Crypto.getRandomBytesAsync(32));
  await storeThreadKey(relationshipId, generated);
  return generated;
}

export async function storePendingInviteKey(token: string, key: string) {
  await SecureStore.setItemAsync(`${PENDING_PREFIX}${token}`, assertKey(key), secureOptions);
}

export async function consumePendingInviteKey(token: string, relationshipId: string) {
  const pendingName = `${PENDING_PREFIX}${token}`;
  const key = await SecureStore.getItemAsync(pendingName, secureOptions);
  if (!key) throw new Error('This invitation is missing its secure conversation key. Ask the sender for a new invitation.');
  await storeThreadKey(relationshipId, key);
  await SecureStore.deleteItemAsync(pendingName, secureOptions);
  return key;
}

export async function getPendingInviteKey(token: string) {
  const key = await SecureStore.getItemAsync(`${PENDING_PREFIX}${token}`, secureOptions);
  return key ? assertKey(key) : null;
}

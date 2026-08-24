import {
  AESEncryptionKey,
  AESSealedData,
  CryptoDigestAlgorithm,
  aesDecryptAsync,
  aesEncryptAsync,
  digestStringAsync,
  getRandomBytesAsync,
} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const THREAD_PREFIX = 'talktwo.threadkey.';
const PENDING_TOKEN_PREFIX = 'talktwo.invite-secret.token.';
const PENDING_INVITATION_PREFIX = 'talktwo.invite-secret.id.';
const RECOVERY_REQUEST_PREFIX = 'talktwo.key-recovery.request.';
const RECOVERY_APPROVAL_PREFIX = 'talktwo.key-recovery.approval.';
const SECRET_INDEX_NAME = 'talktwo.secure-secret-index.v1';
const TRACKED_PREFIXES = [
  THREAD_PREFIX,
  PENDING_TOKEN_PREFIX,
  PENDING_INVITATION_PREFIX,
  RECOVERY_REQUEST_PREFIX,
  RECOVERY_APPROVAL_PREFIX,
] as const;
const KEY_PATTERN = /^[0-9a-f]{64}$/i;
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let registryQueue: Promise<void> = Promise.resolve();

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function assertKey(key: string) {
  if (!KEY_PATTERN.test(key)) throw new Error('The secure key is invalid.');
  return key.toLowerCase();
}

function trackedSecretName(name: string) {
  return TRACKED_PREFIXES.some((prefix) => name.startsWith(prefix));
}

async function readSecretIndex() {
  const stored = await SecureStore.getItemAsync(SECRET_INDEX_NAME, secureOptions);
  if (!stored) return [] as string[];
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((item): item is string => typeof item === 'string' && trackedSecretName(item)))].sort();
  } catch {
    return [];
  }
}

async function writeSecretIndex(names: string[]) {
  const unique = [...new Set(names.filter(trackedSecretName))].sort();
  if (unique.length === 0) {
    await SecureStore.deleteItemAsync(SECRET_INDEX_NAME, secureOptions);
    return;
  }
  await SecureStore.setItemAsync(SECRET_INDEX_NAME, JSON.stringify(unique), secureOptions);
}

async function mutateSecretIndex(mutator: (current: string[]) => string[]) {
  const operation = registryQueue.then(async () => {
    await writeSecretIndex(mutator(await readSecretIndex()));
  });
  registryQueue = operation.catch(() => undefined);
  await operation;
}

async function trackSecretName(name: string) {
  if (!trackedSecretName(name)) throw new Error('Unexpected secure secret name.');
  await mutateSecretIndex((current) => current.includes(name) ? current : [...current, name]);
}

async function untrackSecretName(name: string) {
  await mutateSecretIndex((current) => current.filter((item) => item !== name));
}

async function setTrackedSecret(name: string, value: string) {
  // Register first so an interrupted write can leave at worst a harmless stale
  // index entry, never an untracked secret that account deletion cannot find.
  await trackSecretName(name);
  await SecureStore.setItemAsync(name, value, secureOptions);
}

async function getTrackedSecret(name: string) {
  const value = await SecureStore.getItemAsync(name, secureOptions);
  // This also migrates secrets written by pre-index TalkTwo builds as they are used.
  if (value) await trackSecretName(name);
  return value;
}

async function deleteTrackedSecret(name: string) {
  await SecureStore.deleteItemAsync(name, secureOptions);
  await untrackSecretName(name);
}

async function clearTrackedSecrets(predicate: (name: string) => boolean) {
  await registryQueue;
  const names = await readSecretIndex();
  const deleting = names.filter(predicate);
  await Promise.all(deleting.map((name) => SecureStore.deleteItemAsync(name, secureOptions)));
  await writeSecretIndex(names.filter((name) => !predicate(name)));
}

function envelopeAad(token: string) {
  return encoder.encode(`talktwo-key-envelope-v1:${token.trim()}`);
}

function recoveryAad(token: string) {
  return encoder.encode(`talktwo-key-recovery-v1:${token.trim()}`);
}

async function recoveryVerificationCode(secret: string) {
  const digest = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    `talktwo-recovery-code-v1:${assertKey(secret)}`,
  );
  return `${digest.slice(0, 4)}-${digest.slice(4, 8)}`.toUpperCase();
}

export async function getThreadKey(relationshipId: string) {
  const key = await getTrackedSecret(`${THREAD_PREFIX}${relationshipId}`);
  return key ? assertKey(key) : null;
}

export async function storeThreadKey(relationshipId: string, key: string) {
  await setTrackedSecret(`${THREAD_PREFIX}${relationshipId}`, assertKey(key));
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
  await setTrackedSecret(`${PENDING_TOKEN_PREFIX}${token}`, assertKey(secret));
}

export async function getPendingInviteSecret(token: string) {
  const secret = await getTrackedSecret(`${PENDING_TOKEN_PREFIX}${token}`);
  return secret ? assertKey(secret) : null;
}

export async function consumeInitialInviteEnvelope(token: string, relationshipId: string, envelope: string) {
  const pendingName = `${PENDING_TOKEN_PREFIX}${token}`;
  const secret = await getTrackedSecret(pendingName);
  if (!secret) throw new Error('This invitation is missing its one-time encryption secret. Ask the sender for a new invitation.');
  const threadKey = await openInvitationEnvelope(token, secret, envelope);
  await storeThreadKey(relationshipId, threadKey);
  await deleteTrackedSecret(pendingName);
  return threadKey;
}

export async function bindPendingMemberInviteSecret(token: string, invitationId: string) {
  const tokenName = `${PENDING_TOKEN_PREFIX}${token}`;
  const secret = await getTrackedSecret(tokenName);
  if (!secret) throw new Error('This invitation is missing its one-time encryption secret. Ask the sender for a new invitation.');
  await setTrackedSecret(
    `${PENDING_INVITATION_PREFIX}${invitationId}`,
    JSON.stringify({ token: token.trim(), secret: assertKey(secret) }),
  );
  await deleteTrackedSecret(tokenName);
}

export async function installActiveMemberEnvelope(invitationId: string, relationshipId: string, envelope: string) {
  const pendingName = `${PENDING_INVITATION_PREFIX}${invitationId}`;
  const stored = await getTrackedSecret(pendingName);
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
  await deleteTrackedSecret(pendingName);
  return true;
}

export async function removeThreadKeys(relationshipIds: string[]) {
  await Promise.all(
    [...new Set(relationshipIds)]
      .filter(Boolean)
      .map((relationshipId) => deleteTrackedSecret(`${THREAD_PREFIX}${relationshipId}`)),
  );
}

export async function clearPendingThreadSecrets() {
  await clearTrackedSecrets((name) => !name.startsWith(THREAD_PREFIX));
}

export async function clearAllTalkTwoThreadSecrets() {
  await clearTrackedSecrets(() => true);
}

export async function createKeyRecoverySecret(requestId: string, token: string) {
  const secret = bytesToHex(await getRandomBytesAsync(32));
  await setTrackedSecret(
    `${RECOVERY_REQUEST_PREFIX}${requestId}`,
    JSON.stringify({ token: token.trim(), secret }),
  );
  return { secret, verificationCode: await recoveryVerificationCode(secret) };
}

export async function storePendingKeyRecoveryApproval(token: string, secret: string) {
  await setTrackedSecret(`${RECOVERY_APPROVAL_PREFIX}${token.trim()}`, assertKey(secret));
}

export async function keyRecoveryApprovalCode(token: string) {
  const secret = await getTrackedSecret(`${RECOVERY_APPROVAL_PREFIX}${token.trim()}`);
  if (!secret) throw new Error('This recovery link is missing its one-time secret. Ask for a new recovery request.');
  return recoveryVerificationCode(secret);
}

export async function createKeyRecoveryEnvelope(token: string, relationshipId: string) {
  const secretName = `${RECOVERY_APPROVAL_PREFIX}${token.trim()}`;
  const [secret, threadKey] = await Promise.all([
    getTrackedSecret(secretName),
    getThreadKey(relationshipId),
  ]);
  if (!secret) throw new Error('This recovery link is missing its one-time secret. Ask for a new recovery request.');
  if (!threadKey) throw new Error('This device does not have the conversation key and cannot approve recovery.');
  const wrappingKey = await AESEncryptionKey.import(assertKey(secret), 'hex');
  const sealed = await aesEncryptAsync(encoder.encode(threadKey), wrappingKey, { additionalData: recoveryAad(token) });
  return await sealed.combined('base64') as string;
}

export async function clearKeyRecoveryApproval(token: string) {
  await deleteTrackedSecret(`${RECOVERY_APPROVAL_PREFIX}${token.trim()}`);
}

export async function installKeyRecoveryEnvelope(requestId: string, token: string, relationshipId: string, envelope: string) {
  const requestName = `${RECOVERY_REQUEST_PREFIX}${requestId}`;
  const stored = await getTrackedSecret(requestName);
  if (!stored) return false;
  let parsed: { token?: unknown; secret?: unknown };
  try {
    parsed = JSON.parse(stored) as { token?: unknown; secret?: unknown };
  } catch {
    throw new Error('The recovery secret on this device is damaged. Create a new recovery request.');
  }
  if (parsed.token !== token || typeof parsed.secret !== 'string') {
    throw new Error('The recovery response does not match this device request.');
  }
  const wrappingKey = await AESEncryptionKey.import(assertKey(parsed.secret), 'hex');
  const sealed = AESSealedData.fromCombined(envelope);
  const decrypted = await aesDecryptAsync(sealed, wrappingKey, { additionalData: recoveryAad(token), output: 'bytes' });
  await storeThreadKey(relationshipId, assertKey(decoder.decode(decrypted as Uint8Array).trim()));
  await deleteTrackedSecret(requestName);
  return true;
}

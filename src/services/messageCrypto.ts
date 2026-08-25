import {
  AESEncryptionKey,
  AESSealedData,
  CryptoDigestAlgorithm,
  aesDecryptAsync,
  aesEncryptAsync,
  digestStringAsync,
} from 'expo-crypto';
import { getThreadKey } from './threadKeys';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const V2_PREFIX = 'v2.';

function aadV1(relationshipId: string) {
  return encoder.encode(`talktwo-message-v1:${relationshipId}`);
}

function aadV2(relationshipId: string, logicalId: string) {
  return encoder.encode(`talktwo-message-v2:${relationshipId}:${logicalId}`);
}

export async function hashMessageBody(body: string) {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, body.trim());
}

export async function encryptMessageBody(relationshipId: string, body: string, logicalId?: string) {
  const keyHex = await getThreadKey(relationshipId);
  if (!keyHex) throw new Error('The secure key for this conversation is missing.');
  const key = await AESEncryptionKey.import(keyHex, 'hex');
  const sealed = await aesEncryptAsync(
    encoder.encode(body.trim()),
    key,
    { additionalData: logicalId ? aadV2(relationshipId, logicalId) : aadV1(relationshipId) },
  );
  const combined = await sealed.combined('base64');
  return logicalId ? `${V2_PREFIX}${combined}` : combined;
}

export async function decryptMessageBody(
  relationshipId: string,
  ciphertext: string,
  expectedHash: string,
  logicalId?: string,
) {
  const keyHex = await getThreadKey(relationshipId);
  if (!keyHex) throw new Error('The secure key for this conversation is missing.');
  const key = await AESEncryptionKey.import(keyHex, 'hex');
  const isV2 = ciphertext.startsWith(V2_PREFIX);
  if (isV2 && !logicalId) throw new Error('The secure message identifier is missing.');
  const encoded = isV2 ? ciphertext.slice(V2_PREFIX.length) : ciphertext;
  const sealed = AESSealedData.fromCombined(encoded);
  const decrypted = await aesDecryptAsync(
    sealed,
    key,
    { additionalData: isV2 ? aadV2(relationshipId, logicalId as string) : aadV1(relationshipId), output: 'bytes' },
  );
  const text = decoder.decode(decrypted as Uint8Array).trim();
  const hash = await hashMessageBody(text);
  if (hash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error('The encrypted message did not match the server-approved message.');
  }
  return text;
}

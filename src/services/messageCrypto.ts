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

function aad(relationshipId: string) {
  return encoder.encode(`talktwo-message-v1:${relationshipId}`);
}

export async function hashMessageBody(body: string) {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, body.trim());
}

export async function encryptMessageBody(relationshipId: string, body: string) {
  const keyHex = await getThreadKey(relationshipId);
  if (!keyHex) throw new Error('The secure key for this conversation is missing.');
  const key = await AESEncryptionKey.import(keyHex, 'hex');
  const sealed = await aesEncryptAsync(encoder.encode(body.trim()), key, { additionalData: aad(relationshipId) });
  return sealed.combined('base64') as Promise<string>;
}

export async function decryptMessageBody(relationshipId: string, ciphertext: string, expectedHash: string) {
  const keyHex = await getThreadKey(relationshipId);
  if (!keyHex) throw new Error('The secure key for this conversation is missing.');
  const key = await AESEncryptionKey.import(keyHex, 'hex');
  const sealed = AESSealedData.fromCombined(ciphertext);
  const decrypted = await aesDecryptAsync(sealed, key, { additionalData: aad(relationshipId), output: 'bytes' });
  const text = decoder.decode(decrypted as Uint8Array).trim();
  const hash = await hashMessageBody(text);
  if (hash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error('The encrypted message did not match the server-approved message.');
  }
  return text;
}

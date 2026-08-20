import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { Purchase } from 'expo-iap';
import { Platform } from 'react-native';
import { googleAccountBindingInput, parsePendingStorePurchase, storeVerificationBody, type PendingStorePurchase } from '../domain/storePurchase';
import type { StorePlatform } from '../domain/storeProducts';
import { supabase } from '../lib/supabase';

const PENDING_STORE_PURCHASE_KEY = 'talktwo.pendingStorePurchase.v1';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export class StorePurchaseNotLinkedError extends Error {
  constructor() {
    super('This purchase is not linked to this TalkTwo account.');
    this.name = 'StorePurchaseNotLinkedError';
  }
}

async function functionErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('context' in error)) return null;
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return null;
  try {
    const payload = await context.clone().json() as { error?: unknown };
    return typeof payload.error === 'string' ? payload.error : null;
  } catch {
    return null;
  }
}

export function nativeStorePlatform(): StorePlatform {
  if (Platform.OS === 'ios') return 'apple';
  if (Platform.OS === 'android') return 'google';
  throw new Error('Store purchases require the iOS or Android app.');
}

export async function storeAccountBinding(platform: StorePlatform, userId: string) {
  if (platform === 'apple') return userId.toLowerCase();
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    googleAccountBindingInput(userId),
  );
}

export async function savePendingStorePurchase(pending: PendingStorePurchase) {
  await SecureStore.setItemAsync(PENDING_STORE_PURCHASE_KEY, JSON.stringify(pending), secureOptions);
}

export async function loadPendingStorePurchase() {
  const value = await SecureStore.getItemAsync(PENDING_STORE_PURCHASE_KEY, secureOptions);
  const parsed = parsePendingStorePurchase(value);
  if (!parsed && value) await clearPendingStorePurchase();
  return parsed;
}

export async function clearPendingStorePurchase() {
  await SecureStore.deleteItemAsync(PENDING_STORE_PURCHASE_KEY, secureOptions);
}

export async function verifyStorePurchase(
  purchase: Purchase,
  mode: 'purchase' | 'restore',
  checkoutIntentId?: string | null,
) {
  const { data, error } = await supabase.functions.invoke('verify-store-purchase', {
    body: storeVerificationBody(purchase, mode, checkoutIntentId),
  });
  if (error) {
    if (await functionErrorCode(error) === 'restore_not_linked') throw new StorePurchaseNotLinkedError();
    throw error;
  }
  if (!data?.verified) throw new Error(mode === 'restore' ? 'This purchase is not linked to this TalkTwo account.' : 'The purchase could not be verified.');
  return data as { verified: true; restored?: boolean; result?: unknown };
}

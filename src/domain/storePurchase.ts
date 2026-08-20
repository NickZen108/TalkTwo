import { STORE_PRODUCTS, productIdFor, storeProductKeyForId, type StorePlatform, type StoreProductKey } from './storeProducts';

export type ExtraMemberRole = 'observer' | 'participant';

export interface PendingStorePurchase {
  checkoutIntentId: string;
  expiresAt: string;
  productKey: StoreProductKey;
  userId: string;
}

export interface StorePurchaseEvidence {
  productId: string;
  purchaseState: string;
  purchaseToken?: string | null;
  store: string;
}

export interface GoogleSubscriptionProductLike {
  id: string;
  platform: string;
  subscriptionOffers?: Array<{ offerTokenAndroid?: string | null }> | null;
}

export function extraMemberProductKey(role: ExtraMemberRole): StoreProductKey {
  return role === 'observer' ? 'extra_observer_monthly' : 'extra_participant_monthly';
}

export function googleAccountBindingInput(userId: string) {
  return `talktwo:${userId}`;
}

export function parsePendingStorePurchase(value: string | null, now = Date.now()): PendingStorePurchase | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PendingStorePurchase>;
    if (
      typeof parsed.checkoutIntentId !== 'string' || !parsed.checkoutIntentId
      || typeof parsed.userId !== 'string' || !parsed.userId
      || typeof parsed.expiresAt !== 'string' || !parsed.expiresAt
      || typeof parsed.productKey !== 'string' || !(parsed.productKey in STORE_PRODUCTS)
    ) return null;
    const expiresAt = new Date(parsed.expiresAt).valueOf();
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
    return parsed as PendingStorePurchase;
  } catch {
    return null;
  }
}

export function pendingPurchaseMatches(
  pending: PendingStorePurchase,
  platform: StorePlatform,
  purchase: StorePurchaseEvidence,
) {
  return pending.userId.length > 0
    && purchase.productId === productIdFor(platform, pending.productKey);
}

export function googleSubscriptionOffer(
  product: GoogleSubscriptionProductLike | undefined,
  expectedProductId: string,
) {
  if (!product || product.platform !== 'android' || product.id !== expectedProductId) {
    throw new Error('The Google Play subscription is not available.');
  }
  const offers = (product.subscriptionOffers ?? [])
    .map((offer) => offer.offerTokenAndroid?.trim() ?? '')
    .filter(Boolean);
  if (offers.length !== 1) {
    throw new Error('The Google Play subscription must have exactly one eligible offer.');
  }
  return { sku: expectedProductId, offerToken: offers[0] as string };
}

export function storeVerificationBody(
  purchase: StorePurchaseEvidence,
  mode: 'purchase' | 'restore',
  checkoutIntentId?: string | null,
) {
  if (purchase.purchaseState !== 'purchased') throw new Error('The store purchase is not completed.');
  if (purchase.store !== 'apple' && purchase.store !== 'google') throw new Error('Unsupported store purchase.');
  const platform = purchase.store;
  const productKey = storeProductKeyForId(platform, purchase.productId);
  const token = purchase.purchaseToken?.trim() ?? '';
  if (!productKey || !token) throw new Error('The store purchase is incomplete.');
  if (mode === 'purchase' && !checkoutIntentId) throw new Error('Checkout intent is required.');

  return platform === 'apple'
    ? {
        platform,
        mode,
        checkoutIntentId: mode === 'purchase' ? checkoutIntentId : undefined,
        signedTransactionInfo: token,
      }
    : {
        platform,
        mode,
        checkoutIntentId: mode === 'purchase' ? checkoutIntentId : undefined,
        purchaseToken: token,
        purchaseKind: STORE_PRODUCTS[productKey].kind,
      };
}

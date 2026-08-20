import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorCode, getAvailablePurchases, useIAP, type Purchase, type ProductSubscription } from 'expo-iap';
import { Platform } from 'react-native';
import { createExtraMemberCheckoutIntent } from '../services/billing';
import {
  clearPendingStorePurchase,
  loadPendingStorePurchase,
  nativeStorePlatform,
  savePendingStorePurchase,
  StorePurchaseNotLinkedError,
  storeAccountBinding,
  verifyStorePurchase,
} from '../services/storeBilling';
import {
  extraMemberProductKey,
  googleSubscriptionOffer,
  pendingPurchaseMatches,
  type ExtraMemberRole,
} from '../domain/storePurchase';
import { productIdFor, subscriptionProductIdsFor } from '../domain/storeProducts';

interface NativeStoreBillingCallbacks {
  onError: (message: string) => void;
  onPurchaseVerified: () => void | Promise<void>;
  onRestoreFinished: (count: number) => void | Promise<void>;
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : 'The store purchase could not be completed.';
}

function purchaseKey(purchase: Purchase) {
  return `${purchase.store}:${purchase.purchaseToken ?? purchase.transactionId ?? purchase.id}`;
}

export function useNativeStoreBilling(userId: string, callbacks: NativeStoreBillingCallbacks) {
  const callbacksRef = useRef(callbacks);
  const purchaseHandlerRef = useRef<((purchase: Purchase) => Promise<boolean>) | null>(null);
  const completedRef = useRef(new Set<string>());
  const [processing, setProcessing] = useState(false);

  useEffect(() => { callbacksRef.current = callbacks; }, [callbacks]);

  const iap = useIAP({
    onPurchaseSuccess: (purchase) => { void purchaseHandlerRef.current?.(purchase); },
    onPurchaseError: (error) => {
      setProcessing(false);
      if (error.code === ErrorCode.UserCancelled) {
        void clearPendingStorePurchase().catch(() => undefined);
      } else {
        callbacksRef.current.onError(error.message || 'The store purchase could not be completed.');
      }
    },
  });

  const completePurchase = useCallback(async (purchase: Purchase) => {
    const key = purchaseKey(purchase);
    if (completedRef.current.has(key)) return false;
    const platform = nativeStorePlatform();
    if (purchase.store !== platform) throw new Error('The purchase came from an unexpected store.');

    const pending = await loadPendingStorePurchase();
    const isPendingPurchase = pending
      && pending.userId === userId
      && pendingPurchaseMatches(pending, platform, purchase);
    await verifyStorePurchase(
      purchase,
      isPendingPurchase ? 'purchase' : 'restore',
      isPendingPurchase ? pending.checkoutIntentId : null,
    );
    await iap.finishTransaction({ purchase, isConsumable: false });
    if (isPendingPurchase) await clearPendingStorePurchase();
    completedRef.current.add(key);
    return true;
  }, [iap.finishTransaction, userId]);

  useEffect(() => { purchaseHandlerRef.current = async (purchase) => {
    setProcessing(true);
    try {
      const completed = await completePurchase(purchase);
      if (completed) await callbacksRef.current.onPurchaseVerified();
      return completed;
    } catch (error) {
      callbacksRef.current.onError(messageFor(error));
      return false;
    } finally {
      setProcessing(false);
    }
  }; }, [completePurchase]);

  useEffect(() => {
    if (!iap.connected || Platform.OS === 'web') return;
    const platform = nativeStorePlatform();
    void iap.fetchProducts({ skus: subscriptionProductIdsFor(platform), type: 'subs' })
      .catch((error) => callbacksRef.current.onError(messageFor(error)));
  }, [iap.connected, iap.fetchProducts]);

  const purchaseExtraMember = useCallback(async (invitationId: string, role: ExtraMemberRole) => {
    if (!iap.connected) throw new Error('The App Store connection is not ready yet.');
    setProcessing(true);
    try {
      const platform = nativeStorePlatform();
      const productKey = extraMemberProductKey(role);
      const productId = productIdFor(platform, productKey);
      const offer = await createExtraMemberCheckoutIntent(invitationId);
      const expectedMinor = role === 'observer' ? 2900 : 9900;
      if (!offer.recurring || offer.currency !== 'dkk' || offer.amount_minor !== expectedMinor) {
        throw new Error('The server returned an unexpected membership offer.');
      }
      await savePendingStorePurchase({
        checkoutIntentId: offer.intent_id,
        expiresAt: offer.expires_at,
        productKey,
        userId,
      });
      const binding = await storeAccountBinding(platform, userId);

      if (platform === 'apple') {
        await iap.requestPurchase({
          type: 'subs',
          request: { apple: { sku: productId, appAccountToken: binding } },
        });
      } else {
        const selected = googleSubscriptionOffer(
          iap.subscriptions.find((item) => item.id === productId) as ProductSubscription | undefined,
          productId,
        );
        await iap.requestPurchase({
          type: 'subs',
          request: {
            google: {
              skus: [productId],
              obfuscatedAccountId: binding,
              subscriptionOffers: [selected],
            },
          },
        });
      }
    } catch (error) {
      setProcessing(false);
      if (error && typeof error === 'object' && 'code' in error && error.code === ErrorCode.UserCancelled) {
        await clearPendingStorePurchase().catch(() => undefined);
      }
      throw error;
    }
  }, [iap.connected, iap.requestPurchase, iap.subscriptions, userId]);

  const restore = useCallback(async () => {
    if (!iap.connected) throw new Error('The App Store connection is not ready yet.');
    setProcessing(true);
    try {
      if (Platform.OS === 'ios') await iap.restorePurchases();
      const purchases = await getAvailablePurchases({
        onlyIncludeActiveItemsIOS: true,
        includeSuspendedAndroid: false,
      });
      let restored = 0;
      for (const purchase of purchases) {
        try {
          if (await completePurchase(purchase)) restored += 1;
        } catch (error) {
          // Purchases not already linked to this TalkTwo account remain unfinished.
          if (!(error instanceof StorePurchaseNotLinkedError)) throw error;
        }
      }
      await callbacksRef.current.onRestoreFinished(restored);
    } finally {
      setProcessing(false);
    }
  }, [completePurchase, iap.connected, iap.restorePurchases]);

  return {
    connected: iap.connected,
    processing,
    purchaseExtraMember,
    restore,
  };
}

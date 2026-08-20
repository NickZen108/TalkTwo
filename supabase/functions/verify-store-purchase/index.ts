import { appleVerifier } from '../_shared/apple.ts';
import { getGoogleOneTimePurchase, getGoogleSubscription } from '../_shared/google.ts';
import { jsonResponse, requestJson, requiredEnv } from '../_shared/http.ts';
import {
  appleAppAccountToken,
  googleObfuscatedAccountId,
  googleVerifiedAccountId,
  normalizeAppleTransaction,
  normalizeGoogleOneTimePurchase,
  normalizeGoogleSubscription,
  storeEventRpcArgs,
} from '../_shared/storeEvents.ts';
import { supabaseAdmin, supabaseForRequest } from '../_shared/supabaseClients.ts';

type PurchaseRequest = {
  platform?: unknown;
  checkoutIntentId?: unknown;
  signedTransactionInfo?: unknown;
  purchaseToken?: unknown;
  purchaseKind?: unknown;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const userClient = supabaseForRequest(req);
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'authentication_required' }, 401);

    const body = await requestJson(req) as PurchaseRequest;
    const checkoutIntentId = typeof body.checkoutIntentId === 'string' ? body.checkoutIntentId.trim() : '';
    if (!checkoutIntentId) return jsonResponse({ error: 'checkout_intent_required' }, 400);

    let event;
    if (body.platform === 'apple') {
      const signedTransaction = typeof body.signedTransactionInfo === 'string'
        ? body.signedTransactionInfo
        : '';
      if (!signedTransaction) return jsonResponse({ error: 'signed_transaction_required' }, 400);
      const transaction = await appleVerifier().verifyAndDecodeTransaction(signedTransaction);
      if (appleAppAccountToken(transaction)?.toLowerCase() !== user.id.toLowerCase()) {
        return jsonResponse({ error: 'purchase_account_mismatch' }, 400);
      }
      event = await normalizeAppleTransaction(transaction, signedTransaction);
    } else if (body.platform === 'google') {
      const purchaseToken = typeof body.purchaseToken === 'string' ? body.purchaseToken.trim() : '';
      if (!purchaseToken) return jsonResponse({ error: 'purchase_token_required' }, 400);
      const envelope = {
        messageId: `client:${purchaseToken}`,
        packageName: requiredEnv('GOOGLE_PACKAGE_NAME'),
        purchaseKind: body.purchaseKind === 'one_time' ? 'one_time' as const : 'subscription' as const,
        purchaseToken,
        productId: null,
        eventType: 'purchase' as const,
        occurredAt: new Date().toISOString(),
        decodedData: {},
        rawData: purchaseToken,
      };
      const verifiedPurchase = envelope.purchaseKind === 'one_time'
        ? await getGoogleOneTimePurchase(purchaseToken)
        : await getGoogleSubscription(purchaseToken);
      const expectedAccountId = await googleObfuscatedAccountId(user.id);
      if (googleVerifiedAccountId(envelope.purchaseKind, verifiedPurchase) !== expectedAccountId) {
        return jsonResponse({ error: 'purchase_account_mismatch' }, 400);
      }
      event = envelope.purchaseKind === 'one_time'
        ? await normalizeGoogleOneTimePurchase(envelope, verifiedPurchase)
        : await normalizeGoogleSubscription(envelope, verifiedPurchase);
    } else {
      return jsonResponse({ error: 'unsupported_platform' }, 400);
    }

    const { data, error } = await supabaseAdmin().rpc(
      'process_verified_store_notification',
      storeEventRpcArgs(event, { userId: user.id, checkoutIntentId }),
    );
    if (error) throw error;
    return jsonResponse({ verified: true, result: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Purchase verification failed.';
    const configurationFailure = /^Missing |must be Sandbox|APPLE_APP_ID/i.test(message);
    const providerFailure = /verification|certificate|signature|Google Play verification/i.test(message);
    return jsonResponse(
      { error: configurationFailure ? 'store_not_configured' : providerFailure ? 'purchase_not_verified' : 'processing_failed' },
      configurationFailure ? 503 : providerFailure ? 400 : 500,
    );
  }
});

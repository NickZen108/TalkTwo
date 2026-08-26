import { appleVerifier } from '../_shared/apple.ts';
import { getGoogleOneTimePurchase, getGoogleSubscription } from '../_shared/google.ts';
import { jsonResponse, requestJson, requiredEnv } from '../_shared/http.ts';
import {
  appleAppAccountToken,
  assertCurrentAppleSubscription,
  assertCurrentGoogleSubscription,
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
  mode?: unknown;
  checkoutIntentId?: unknown;
  signedTransactionInfo?: unknown;
  purchaseToken?: unknown;
  purchaseKind?: unknown;
};

type UpgradeVerificationContext = {
  payment_provider: 'apple' | 'google';
  provider_subscription_id: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const userClient = supabaseForRequest(req);
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'authentication_required' }, 401);

    const body = await requestJson(req) as PurchaseRequest;
    const mode = body.mode === 'restore' ? 'restore' : body.mode === 'purchase' || body.mode === undefined ? 'purchase' : null;
    if (!mode) return jsonResponse({ error: 'unsupported_verification_mode' }, 400);
    const checkoutIntentId = typeof body.checkoutIntentId === 'string' ? body.checkoutIntentId.trim() : '';
    if (mode === 'purchase' && !checkoutIntentId) return jsonResponse({ error: 'checkout_intent_required' }, 400);
    if (mode === 'restore' && checkoutIntentId) return jsonResponse({ error: 'checkout_intent_not_allowed_for_restore' }, 400);

    let event;
    let googleLinkedPurchaseToken: string | null = null;
    if (body.platform === 'apple') {
      const signedTransaction = typeof body.signedTransactionInfo === 'string'
        ? body.signedTransactionInfo
        : '';
      if (!signedTransaction) return jsonResponse({ error: 'signed_transaction_required' }, 400);
      const transaction = await appleVerifier().verifyAndDecodeTransaction(signedTransaction);
      if (appleAppAccountToken(transaction)?.toLowerCase() !== user.id.toLowerCase()) {
        return jsonResponse({ error: 'purchase_account_mismatch' }, 400);
      }
      if (mode === 'purchase') assertCurrentAppleSubscription(transaction);
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
      if (mode === 'purchase' && envelope.purchaseKind === 'subscription') {
        assertCurrentGoogleSubscription(verifiedPurchase);
        googleLinkedPurchaseToken = text(record(verifiedPurchase).linkedPurchaseToken);
      }
      event = envelope.purchaseKind === 'one_time'
        ? await normalizeGoogleOneTimePurchase(envelope, verifiedPurchase)
        : await normalizeGoogleSubscription(envelope, verifiedPurchase);
    } else {
      return jsonResponse({ error: 'unsupported_platform' }, 400);
    }

    const admin = supabaseAdmin();

    // Observer -> participant is a replacement of an existing paid subscription,
    // not permission to create a second unrelated subscription. For an upgrade
    // checkout the database returns the current verified provider identity. Apple
    // must keep the same original transaction within the subscription group;
    // Google must explicitly link the new purchase token to the old token.
    if (mode === 'purchase' && checkoutIntentId) {
      const { data: contextRows, error: contextError } = await admin.rpc(
        'get_member_upgrade_verification_context',
        { intent_id: checkoutIntentId, purchaser: user.id },
      );
      if (contextError) throw contextError;
      const context = (Array.isArray(contextRows) ? contextRows[0] : contextRows) as UpgradeVerificationContext | null;
      if (context) {
        const expectedProviderId = text(context.provider_subscription_id);
        if (!expectedProviderId || context.payment_provider !== event.platform) {
          return jsonResponse({ error: 'subscription_replacement_mismatch' }, 400);
        }
        const replacementMatches = event.platform === 'apple'
          ? event.providerOriginalTransactionId === expectedProviderId
          : googleLinkedPurchaseToken === expectedProviderId;
        if (!replacementMatches) {
          return jsonResponse({ error: 'subscription_replacement_mismatch' }, 400);
        }
      }
    }

    if (mode === 'restore') {
      const { data: restored, error: restoreError } = await admin.rpc('confirm_verified_store_restore', {
        p_platform: event.platform,
        p_product_id: event.productId,
        p_provider_transaction_id: event.providerTransactionId,
        p_provider_original_transaction_id: event.providerOriginalTransactionId,
        p_user_id: user.id,
      });
      if (restoreError) throw restoreError;
      if (restored !== true) return jsonResponse({ error: 'restore_not_linked' }, 404);
      return jsonResponse({ verified: true, restored: true });
    }

    const { data, error } = await admin.rpc(
      'process_verified_store_notification',
      storeEventRpcArgs(event, { userId: user.id, checkoutIntentId }),
    );
    if (error) throw error;
    return jsonResponse({ verified: true, result: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Purchase verification failed.';
    const configurationFailure = /^Missing |must be Sandbox|APPLE_APP_ID/i.test(message);
    const providerFailure = /verification|certificate|signature|Google Play verification|not active|revoked/i.test(message);
    return jsonResponse(
      { error: configurationFailure ? 'store_not_configured' : providerFailure ? 'purchase_not_verified' : 'processing_failed' },
      configurationFailure ? 503 : providerFailure ? 400 : 500,
    );
  }
});

import {
  getGoogleOneTimePurchase,
  getGoogleSubscription,
  verifyGooglePackageName,
  verifyGooglePubSubRequest,
} from '../_shared/google.ts';
import { jsonResponse, requestJson, requiredEnv } from '../_shared/http.ts';
import {
  normalizeGoogleOneTimePurchase,
  normalizeGoogleSubscription,
  parseGooglePubSubPush,
  sha256Hex,
  storeEventRpcArgs,
  type VerifiedStoreEvent,
} from '../_shared/storeEvents.ts';
import { supabaseAdmin } from '../_shared/supabaseClients.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    await verifyGooglePubSubRequest(req);
    const body = await requestJson(req);
    const envelope = parseGooglePubSubPush(body, requiredEnv('GOOGLE_PACKAGE_NAME'));
    verifyGooglePackageName(envelope.packageName);

    let event: VerifiedStoreEvent;
    if (envelope.purchaseKind === 'test') {
      event = {
        platform: 'google',
        providerEventId: envelope.messageId,
        eventType: 'test',
        productId: null,
        providerTransactionId: null,
        providerOriginalTransactionId: null,
        occurredAt: envelope.occurredAt,
        periodStart: null,
        expiresAt: null,
        payloadSha256: await sha256Hex(envelope.rawData),
        verifiedMetadata: { testNotification: true },
      };
    } else if (envelope.purchaseKind === 'subscription') {
      if (!envelope.purchaseToken) throw new Error('Google purchase token required.');
      event = await normalizeGoogleSubscription(
        envelope,
        await getGoogleSubscription(envelope.purchaseToken),
      );
    } else if (envelope.purchaseKind === 'one_time') {
      if (!envelope.purchaseToken) throw new Error('Google purchase token required.');
      event = await normalizeGoogleOneTimePurchase(
        envelope,
        await getGoogleOneTimePurchase(envelope.purchaseToken),
      );
    } else {
      const voided = envelope.decodedData.voidedPurchaseNotification as Record<string, unknown>;
      const productType = typeof voided.productType === 'number' ? voided.productType : null;
      if (!envelope.purchaseToken || (productType !== 1 && productType !== 2)) {
        throw new Error('Google voided purchase data is incomplete.');
      }
      const verified = productType === 1
        ? await normalizeGoogleSubscription(
          { ...envelope, purchaseKind: 'subscription' },
          await getGoogleSubscription(envelope.purchaseToken),
        )
        : await normalizeGoogleOneTimePurchase(
          { ...envelope, purchaseKind: 'one_time' },
          await getGoogleOneTimePurchase(envelope.purchaseToken),
        );
      event = {
        ...verified,
        eventType: 'refund',
        providerTransactionId: typeof voided.orderId === 'string'
          ? voided.orderId
          : verified.providerTransactionId,
      };
    }

    const { data, error } = await supabaseAdmin().rpc(
      'process_verified_store_notification',
      storeEventRpcArgs(event),
    );
    if (error) throw error;
    return jsonResponse({ received: true, result: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google event failed.';
    const authenticationFailure = /bearer token|identity mismatch/i.test(message);
    const malformed = /base64|json|package name|exactly one|required/i.test(message);
    return jsonResponse(
      { error: authenticationFailure ? 'invalid_google_identity' : malformed ? 'invalid_google_event' : 'processing_failed' },
      authenticationFailure ? 401 : malformed ? 400 : 500,
    );
  }
});

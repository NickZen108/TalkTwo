import { appleVerifier } from '../_shared/apple.ts';
import { jsonResponse, requestJson } from '../_shared/http.ts';
import { normalizeAppleNotification, storeEventRpcArgs } from '../_shared/storeEvents.ts';
import { supabaseAdmin } from '../_shared/supabaseClients.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const body = await requestJson(req) as Record<string, unknown>;
    const signedPayload = typeof body.signedPayload === 'string' ? body.signedPayload : '';
    if (!signedPayload) return jsonResponse({ error: 'signed_payload_required' }, 400);

    const verifier = appleVerifier();
    const notification = await verifier.verifyAndDecodeNotification(signedPayload);
    const signedTransaction = notification.data?.signedTransactionInfo;
    const transaction = signedTransaction
      ? await verifier.verifyAndDecodeTransaction(signedTransaction)
      : null;
    const event = await normalizeAppleNotification(notification, transaction, signedPayload);
    const { data, error } = await supabaseAdmin().rpc(
      'process_verified_store_notification',
      storeEventRpcArgs(event),
    );
    if (error) throw error;
    return jsonResponse({ received: true, result: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Apple event failed.';
    const providerFailure = /verification|certificate|signature|payload|required/i.test(message);
    return jsonResponse({ error: providerFailure ? 'invalid_apple_event' : 'processing_failed' }, providerFailure ? 400 : 500);
  }
});

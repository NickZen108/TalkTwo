export type StorePlatform = 'apple' | 'google';

export type StoreEventType =
  | 'purchase'
  | 'renewal'
  | 'recovery'
  | 'cancellation'
  | 'expiry'
  | 'revocation'
  | 'refund'
  | 'grace_period'
  | 'on_hold'
  | 'pause'
  | 'deferred'
  | 'price_change'
  | 'test'
  | 'unknown';

export interface VerifiedStoreEvent {
  platform: StorePlatform;
  providerEventId: string;
  eventType: StoreEventType;
  productId: string | null;
  providerTransactionId: string | null;
  providerOriginalTransactionId: string | null;
  occurredAt: string | null;
  periodStart: string | null;
  expiresAt: string | null;
  payloadSha256: string;
  verifiedMetadata: Record<string, unknown>;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isoFromMillis(value: unknown) {
  const millis = numberValue(value);
  return millis === null ? null : new Date(millis).toISOString();
}

function isoText(value: unknown) {
  const candidate = text(value);
  if (!candidate) return null;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.valueOf())) return null;
  return parsed.toISOString();
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function appleAppAccountToken(decodedTransaction: unknown) {
  return text(record(decodedTransaction).appAccountToken);
}

export function assertCurrentAppleSubscription(decodedTransaction: unknown, now = Date.now()) {
  const transaction = record(decodedTransaction);
  const expiresAt = numberValue(transaction.expiresDate);
  const revokedAt = numberValue(transaction.revocationDate);
  if (revokedAt !== null) throw new Error('Apple purchase has been revoked.');
  if (expiresAt === null || expiresAt <= now) throw new Error('Apple subscription is not active.');
}

export async function googleObfuscatedAccountId(userId: string) {
  return await sha256Hex(`talktwo:${userId}`);
}

export function googleVerifiedAccountId(purchaseKind: 'subscription' | 'one_time', verifiedPurchase: unknown) {
  const purchase = record(verifiedPurchase);
  return purchaseKind === 'subscription'
    ? text(record(purchase.externalAccountIdentifiers).obfuscatedExternalAccountId)
    : text(purchase.obfuscatedExternalAccountId);
}

export function assertCurrentGoogleSubscription(verifiedPurchase: unknown, now = Date.now()) {
  const purchase = record(verifiedPurchase);
  if (text(purchase.subscriptionState) !== 'SUBSCRIPTION_STATE_ACTIVE') {
    throw new Error('Google subscription is not active.');
  }
  const lineItems = Array.isArray(purchase.lineItems) ? purchase.lineItems.map(record) : [];
  if (lineItems.length !== 1) throw new Error('TalkTwo requires exactly one Google subscription line item.');
  const expiry = text(lineItems[0]?.expiryTime);
  const expiresAt = expiry ? new Date(expiry).valueOf() : Number.NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) throw new Error('Google subscription is not active.');
}

export function appleEventType(notificationType: unknown, subtype: unknown): StoreEventType {
  const notification = text(notificationType)?.toUpperCase();
  const detail = text(subtype)?.toUpperCase();

  switch (notification) {
    case 'SUBSCRIBED':
      return detail === 'RESUBSCRIBE' ? 'recovery' : 'purchase';
    case 'DID_RENEW':
      return 'renewal';
    case 'DID_CHANGE_RENEWAL_STATUS':
      return detail === 'AUTO_RENEW_ENABLED' ? 'recovery' : 'cancellation';
    case 'DID_FAIL_TO_RENEW':
      return detail === 'GRACE_PERIOD' ? 'grace_period' : 'on_hold';
    case 'GRACE_PERIOD_EXPIRED':
    case 'EXPIRED':
      return 'expiry';
    case 'REFUND':
      return 'refund';
    case 'REVOKE':
      return 'revocation';
    case 'RENEWAL_EXTENDED':
    case 'RENEWAL_EXTENSION':
      return 'deferred';
    case 'PRICE_INCREASE':
      return 'price_change';
    case 'ONE_TIME_CHARGE':
      return 'purchase';
    case 'TEST':
      return 'test';
    default:
      return 'unknown';
  }
}

export async function normalizeAppleNotification(
  decodedNotification: unknown,
  decodedTransaction: unknown,
  rawSignedPayload: string,
): Promise<VerifiedStoreEvent> {
  const notification = record(decodedNotification);
  const transaction = record(decodedTransaction);
  const providerEventId = text(notification.notificationUUID);
  const eventType = appleEventType(notification.notificationType, notification.subtype);

  if (!providerEventId) throw new Error('Apple notificationUUID is required.');
  if (eventType !== 'test' && !text(transaction.transactionId)) {
    throw new Error('Verified Apple transactionId is required.');
  }

  return {
    platform: 'apple',
    providerEventId,
    eventType,
    productId: text(transaction.productId),
    providerTransactionId: text(transaction.transactionId),
    providerOriginalTransactionId: text(transaction.originalTransactionId),
    occurredAt: isoFromMillis(notification.signedDate),
    periodStart: isoFromMillis(transaction.purchaseDate),
    expiresAt: isoFromMillis(transaction.expiresDate),
    payloadSha256: await sha256Hex(rawSignedPayload),
    verifiedMetadata: {
      notificationType: text(notification.notificationType),
      subtype: text(notification.subtype),
      environment: text(transaction.environment) ?? text(record(notification.data).environment),
      transactionReason: text(transaction.transactionReason),
      revocationReason: numberValue(transaction.revocationReason),
    },
  };
}

export async function normalizeAppleTransaction(
  decodedTransaction: unknown,
  rawSignedTransaction: string,
): Promise<VerifiedStoreEvent> {
  const transaction = record(decodedTransaction);
  const transactionId = text(transaction.transactionId);
  const productId = text(transaction.productId);
  if (!transactionId || !productId) throw new Error('Verified Apple transaction and product IDs are required.');

  return {
    platform: 'apple',
    providerEventId: `client:${transactionId}`,
    eventType: 'purchase',
    productId,
    providerTransactionId: transactionId,
    providerOriginalTransactionId: text(transaction.originalTransactionId),
    occurredAt: isoFromMillis(transaction.signedDate) ?? isoFromMillis(transaction.purchaseDate),
    periodStart: isoFromMillis(transaction.purchaseDate),
    expiresAt: isoFromMillis(transaction.expiresDate),
    payloadSha256: await sha256Hex(rawSignedTransaction),
    verifiedMetadata: {
      environment: text(transaction.environment),
      transactionReason: text(transaction.transactionReason),
      revocationReason: numberValue(transaction.revocationReason),
    },
  };
}

export type GooglePurchaseKind = 'subscription' | 'one_time' | 'voided' | 'test';

export interface GoogleNotificationEnvelope {
  messageId: string;
  packageName: string;
  purchaseKind: GooglePurchaseKind;
  purchaseToken: string | null;
  productId: string | null;
  eventType: StoreEventType;
  occurredAt: string | null;
  decodedData: JsonRecord;
  rawData: string;
}

const GOOGLE_SUBSCRIPTION_EVENTS: Record<number, StoreEventType> = {
  1: 'recovery',
  2: 'renewal',
  3: 'cancellation',
  4: 'purchase',
  5: 'on_hold',
  6: 'grace_period',
  7: 'recovery',
  9: 'deferred',
  10: 'pause',
  12: 'revocation',
  13: 'expiry',
};

function decodeBase64Json(encoded: string) {
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw new Error('Google Pub/Sub data is not valid base64.');
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  try {
    return record(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new Error('Google Pub/Sub data is not valid JSON.');
  }
}

export function parseGooglePubSubPush(payload: unknown, expectedPackageName: string): GoogleNotificationEnvelope {
  const root = record(payload);
  const message = record(root.message);
  const messageId = text(message.messageId);
  const encodedData = text(message.data);
  if (!messageId || !encodedData) throw new Error('Google Pub/Sub messageId and data are required.');

  const decoded = decodeBase64Json(encodedData);
  const packageName = text(decoded.packageName);
  if (packageName !== expectedPackageName) throw new Error('Google package name mismatch.');

  const occurredAt = isoFromMillis(
    typeof decoded.eventTimeMillis === 'string' ? Number(decoded.eventTimeMillis) : decoded.eventTimeMillis,
  );
  const subscription = record(decoded.subscriptionNotification);
  const oneTime = record(decoded.oneTimeProductNotification);
  const voided = record(decoded.voidedPurchaseNotification);
  const isTest = Object.keys(record(decoded.testNotification)).length > 0;

  const kinds = [
    Object.keys(subscription).length > 0,
    Object.keys(oneTime).length > 0,
    Object.keys(voided).length > 0,
    isTest,
  ].filter(Boolean).length;
  if (kinds !== 1) throw new Error('Google notification must contain exactly one supported event payload.');

  if (isTest) {
    return {
      messageId,
      packageName,
      purchaseKind: 'test',
      purchaseToken: null,
      productId: null,
      eventType: 'test',
      occurredAt,
      decodedData: decoded,
      rawData: encodedData,
    };
  }

  if (Object.keys(subscription).length > 0) {
    const notificationType = numberValue(subscription.notificationType);
    return {
      messageId,
      packageName,
      purchaseKind: 'subscription',
      purchaseToken: text(subscription.purchaseToken),
      productId: null,
      eventType: notificationType === null ? 'unknown' : (GOOGLE_SUBSCRIPTION_EVENTS[notificationType] ?? 'unknown'),
      occurredAt,
      decodedData: decoded,
      rawData: encodedData,
    };
  }

  if (Object.keys(oneTime).length > 0) {
    const notificationType = numberValue(oneTime.notificationType);
    return {
      messageId,
      packageName,
      purchaseKind: 'one_time',
      purchaseToken: text(oneTime.purchaseToken),
      productId: text(oneTime.sku),
      eventType: notificationType === 1 ? 'purchase' : 'cancellation',
      occurredAt,
      decodedData: decoded,
      rawData: encodedData,
    };
  }

  return {
    messageId,
    packageName,
    purchaseKind: 'voided',
    purchaseToken: text(voided.purchaseToken),
    productId: null,
    eventType: 'refund',
    occurredAt,
    decodedData: decoded,
    rawData: encodedData,
  };
}

export async function normalizeGoogleSubscription(
  envelope: GoogleNotificationEnvelope,
  verifiedPurchase: unknown,
): Promise<VerifiedStoreEvent> {
  if (envelope.purchaseKind !== 'subscription' || !envelope.purchaseToken) {
    throw new Error('A Google subscription notification with purchase token is required.');
  }

  const purchase = record(verifiedPurchase);
  const lineItems = Array.isArray(purchase.lineItems) ? purchase.lineItems.map(record) : [];
  if (lineItems.length !== 1) throw new Error('TalkTwo requires exactly one Google subscription line item.');
  const lineItem = lineItems[0] ?? {};
  const productId = text(lineItem.productId);
  const transactionId = text(lineItem.latestSuccessfulOrderId) ?? text(purchase.latestOrderId);
  if (!productId || !transactionId) throw new Error('Verified Google product and order IDs are required.');

  return {
    platform: 'google',
    providerEventId: envelope.messageId,
    eventType: envelope.eventType,
    productId,
    providerTransactionId: transactionId,
    providerOriginalTransactionId: envelope.purchaseToken,
    occurredAt: envelope.occurredAt,
    periodStart: isoText(purchase.startTime),
    expiresAt: isoText(lineItem.expiryTime),
    payloadSha256: await sha256Hex(envelope.rawData),
    verifiedMetadata: {
      notificationType: record(envelope.decodedData.subscriptionNotification).notificationType ?? null,
      subscriptionState: text(purchase.subscriptionState),
      acknowledgementState: text(purchase.acknowledgementState),
      testPurchase: Boolean(purchase.testPurchase),
    },
  };
}

export async function normalizeGoogleOneTimePurchase(
  envelope: GoogleNotificationEnvelope,
  verifiedPurchase: unknown,
): Promise<VerifiedStoreEvent> {
  if (envelope.purchaseKind !== 'one_time' || !envelope.purchaseToken) {
    throw new Error('A Google one-time notification with purchase token is required.');
  }

  const purchase = record(verifiedPurchase);
  const lineItems = Array.isArray(purchase.productLineItem) ? purchase.productLineItem.map(record) : [];
  if (lineItems.length !== 1) throw new Error('TalkTwo requires exactly one Google one-time product line item.');
  const productId = text(lineItems[0]?.productId);
  const transactionId = text(purchase.orderId);
  const state = text(record(purchase.purchaseStateContext).purchaseState);
  if (!productId || !transactionId) throw new Error('Verified Google product and order IDs are required.');
  if (state !== 'PURCHASED' && envelope.eventType === 'purchase') {
    throw new Error('Google one-time purchase is not completed.');
  }

  return {
    platform: 'google',
    providerEventId: envelope.messageId,
    eventType: envelope.eventType,
    productId,
    providerTransactionId: transactionId,
    providerOriginalTransactionId: envelope.purchaseToken,
    occurredAt: envelope.occurredAt,
    periodStart: isoText(purchase.purchaseCompletionTime),
    expiresAt: null,
    payloadSha256: await sha256Hex(envelope.rawData),
    verifiedMetadata: {
      purchaseState: state,
      acknowledgementState: text(purchase.acknowledgementState),
      testPurchase: Boolean(purchase.testPurchaseContext),
    },
  };
}

export function storeEventRpcArgs(event: VerifiedStoreEvent, options?: {
  userId?: string | null;
  checkoutIntentId?: string | null;
}) {
  return {
    p_platform: event.platform,
    p_provider_event_id: event.providerEventId,
    p_event_type: event.eventType,
    p_payload_sha256: event.payloadSha256,
    p_product_id: event.productId,
    p_provider_transaction_id: event.providerTransactionId,
    p_provider_original_transaction_id: event.providerOriginalTransactionId,
    p_user_id: options?.userId ?? null,
    p_checkout_intent_id: options?.checkoutIntentId ?? null,
    p_occurred_at: event.occurredAt,
    p_period_start: event.periodStart,
    p_expires_at: event.expiresAt,
    p_verified_metadata: event.verifiedMetadata,
  };
}

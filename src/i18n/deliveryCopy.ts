import type { SupportedLocale } from './translations';

// Sender-visible state is intentionally one-dimensional: sent vs delivered to
// the recipient app. Open/read/reject/block/activity details are never shown.
export function sentDeliveryStatusText(
  deliveredCount: number,
  recipientCount: number,
  _rejectedCount: number,
  locale: SupportedLocale,
) {
  const total = Math.max(1, recipientCount);
  const delivered = Math.max(0, Math.min(deliveredCount, total));

  if (delivered >= total) return locale === 'da' ? 'Leveret' : 'Delivered';
  if (delivered > 0 && total > 1) {
    return locale === 'da' ? `Leveret ${delivered}/${total}` : `Delivered ${delivered}/${total}`;
  }
  return locale === 'da' ? 'Sendt' : 'Sent';
}

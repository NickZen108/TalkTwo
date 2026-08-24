import type { SupportedLocale } from './translations';

export function sentDeliveryStatusText(
  deliveredCount: number,
  recipientCount: number,
  rejectedCount: number,
  locale: SupportedLocale,
) {
  const total = Math.max(1, recipientCount);
  const delivered = Math.max(0, Math.min(deliveredCount, total));
  const rejected = Math.max(0, Math.min(rejectedCount, total));

  const delivery = delivered >= total
    ? locale === 'da' ? 'Leveret' : 'Delivered'
    : delivered > 0 && total > 1
      ? locale === 'da' ? `Leveret ${delivered}/${total}` : `Delivered ${delivered}/${total}`
      : locale === 'da' ? 'Sendt' : 'Sent';

  if (rejected === 0) return delivery;
  const rejection = locale === 'da'
    ? `afvist ulæst ${rejected}${total > 1 ? `/${total}` : ''}`
    : `rejected unread ${rejected}${total > 1 ? `/${total}` : ''}`;
  return `${delivery} · ${rejection}`;
}

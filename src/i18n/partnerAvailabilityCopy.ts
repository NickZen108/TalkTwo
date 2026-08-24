import type { SupportedLocale } from './translations';
import type { PartnerAvailability } from '../domain/partnerAvailability';

function difference(minutes: number, locale: SupportedLocale) {
  if (minutes === 0) return locale === 'da' ? 'samme tid som dig' : 'same time as you';
  const sign = minutes > 0 ? '+' : '−';
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const rest = absolute % 60;
  const amount = [hours ? `${hours} ${locale === 'da' ? 't' : 'h'}` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ');
  return locale === 'da' ? `${sign}${amount} i forhold til dig` : `${sign}${amount} from your time`;
}

export function partnerAvailabilityText(
  availability: PartnerAvailability,
  displayName: string,
  locale: SupportedLocale,
) {
  const local = locale === 'da' ? `lokal tid ${availability.localTime}` : `local time ${availability.localTime}`;
  const timeDifference = difference(availability.differenceMinutes, locale);
  if (!availability.configured) {
    return locale === 'da'
      ? `${displayName}: altid åben · ${local} · ${timeDifference}`
      : `${displayName}: always open · ${local} · ${timeDifference}`;
  }
  if (availability.closedToday) {
    return locale === 'da'
      ? `${displayName}: lukket i dag · ${local} · ${timeDifference}`
      : `${displayName}: closed today · ${local} · ${timeDifference}`;
  }
  const status = availability.isOpen
    ? locale === 'da' ? 'åben nu' : 'open now'
    : locale === 'da' ? 'lukket nu' : 'closed now';
  return `${displayName}: ${status} · ${availability.start ?? '—'}–${availability.end ?? '—'} · ${local} · ${timeDifference}`;
}

export function partnerAvailabilityHeading(locale: SupportedLocale) {
  return locale === 'da' ? 'Kommunikationsvinduer' : 'Communication windows';
}

import type { SupportedLocale } from './translations';

export function windowPrivacyCopy(locale: SupportedLocale) {
  return locale === 'da'
    ? 'Din tidszone og dine beskedtider er private. De bruges kun til at styre, hvornår beskeder bliver tilgængelige for dig, og vises ikke til andre deltagere.'
    : 'Your timezone and message windows are private. They are used only to control when messages become available to you and are not shown to other participants.';
}

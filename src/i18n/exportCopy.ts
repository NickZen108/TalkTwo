import type { SupportedLocale } from './translations';

const copy = {
  en: {
    title: 'Conversation export',
    help: 'Creates an unencrypted PDF from messages already visible on this device. Unopened, blocked and withdrawn messages are never included.',
    action: 'Export visible messages to PDF',
    confirmTitle: 'Export an unencrypted PDF?',
    confirmBody: (count: number) => `This makes a readable copy of ${count} messages already visible on this device. Anyone you share or save it with can read it. Unopened, blocked and withdrawn messages are excluded.`,
    create: 'Create PDF',
    failed: 'PDF could not be created',
    fallbackTitle: 'TalkTwo conversation',
  },
  da: {
    title: 'Eksportér samtale',
    help: 'Opretter en ukrypteret PDF af beskeder, der allerede er synlige på denne enhed. Uåbnede, blokerede og tilbagetrukne beskeder medtages aldrig.',
    action: 'Eksportér synlige beskeder til PDF',
    confirmTitle: 'Eksportér en ukrypteret PDF?',
    confirmBody: (count: number) => `Det laver en læsbar kopi af ${count} beskeder, som allerede er synlige på denne enhed. Alle, du deler eller gemmer PDF'en hos, kan læse den. Uåbnede, blokerede og tilbagetrukne beskeder medtages ikke.`,
    create: 'Opret PDF',
    failed: 'PDF kunne ikke oprettes',
    fallbackTitle: 'TalkTwo-samtale',
  },
} as const;

export function getConversationExportCopy(locale: SupportedLocale) {
  return locale === 'da' ? copy.da : copy.en;
}

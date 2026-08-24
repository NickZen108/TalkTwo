import type { SupportedLocale } from './translations';

const copy = {
  en: {
    title: 'Conversation export',
    help: 'Creates an unencrypted PDF from ordinary messages already visible on this device. Unopened, blocked, withdrawn messages and document attachments are never included.',
    action: 'Export visible messages to PDF',
    confirmTitle: 'Export an unencrypted PDF?',
    confirmBody: (count: number) => `This makes a readable copy of ${count} ordinary messages already visible on this device. Anyone you share or save it with can read it. Unopened, blocked, withdrawn messages and document attachments are excluded.`,
    create: 'Create PDF',
    failed: 'PDF could not be created',
    fallbackTitle: 'TalkTwo conversation',
    premiumRequired: 'PDF export requires an active Premium plan or trial.',
  },
  da: {
    title: 'Eksportér samtale',
    help: 'Opretter en ukrypteret PDF af almindelige beskeder, der allerede er synlige på denne enhed. Uåbnede, blokerede og tilbagetrukne beskeder samt dokumentbilag medtages aldrig.',
    action: 'Eksportér synlige beskeder til PDF',
    confirmTitle: 'Eksportér en ukrypteret PDF?',
    confirmBody: (count: number) => `Det laver en læsbar kopi af ${count} almindelige beskeder, som allerede er synlige på denne enhed. Alle, du deler eller gemmer PDF'en hos, kan læse den. Uåbnede, blokerede og tilbagetrukne beskeder samt dokumentbilag medtages ikke.`,
    create: 'Opret PDF',
    failed: 'PDF kunne ikke oprettes',
    fallbackTitle: 'TalkTwo-samtale',
    premiumRequired: 'PDF-eksport kræver et aktivt Premium-abonnement eller en prøveperiode.',
  },
} as const;

export function getConversationExportCopy(locale: SupportedLocale) {
  return locale === 'da' ? copy.da : copy.en;
}

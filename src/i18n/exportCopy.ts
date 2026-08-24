import type { SupportedLocale } from './translations';

const copy = {
  en: {
    title: 'Conversation export',
    help: 'Creates an unencrypted PDF from ordinary messages already visible on this device. Unopened, blocked, withdrawn messages and document attachments are never included.',
    rangeHelp: 'Leave both dates empty for all visible history, or enter a start and/or end date as YYYY-MM-DD.',
    startDate: 'Start date',
    endDate: 'End date',
    action: 'Export visible messages to PDF',
    confirmTitle: 'Export an unencrypted PDF?',
    confirmBody: (count: number) => `This makes a readable copy of ${count} ordinary messages already visible on this device. Anyone you share or save it with can read it. Unopened, blocked, withdrawn messages and document attachments are excluded.`,
    create: 'Create PDF',
    failed: 'PDF could not be created',
    fallbackTitle: 'TalkTwo conversation',
    premiumRequired: 'PDF export requires an active Premium plan or trial.',
    invalidStart: 'Enter the start date as a real date in YYYY-MM-DD format.',
    invalidEnd: 'Enter the end date as a real date in YYYY-MM-DD format.',
    reversedRange: 'The start date must not be after the end date.',
  },
  da: {
    title: 'Eksportér samtale',
    help: 'Opretter en ukrypteret PDF af almindelige beskeder, der allerede er synlige på denne enhed. Uåbnede, blokerede og tilbagetrukne beskeder samt dokumentbilag medtages aldrig.',
    rangeHelp: 'Lad begge datoer stå tomme for hele den synlige historik, eller skriv en start- og/eller slutdato som ÅÅÅÅ-MM-DD.',
    startDate: 'Startdato',
    endDate: 'Slutdato',
    action: 'Eksportér synlige beskeder til PDF',
    confirmTitle: 'Eksportér en ukrypteret PDF?',
    confirmBody: (count: number) => `Det laver en læsbar kopi af ${count} almindelige beskeder, som allerede er synlige på denne enhed. Alle, du deler eller gemmer PDF'en hos, kan læse den. Uåbnede, blokerede og tilbagetrukne beskeder samt dokumentbilag medtages ikke.`,
    create: 'Opret PDF',
    failed: 'PDF kunne ikke oprettes',
    fallbackTitle: 'TalkTwo-samtale',
    premiumRequired: 'PDF-eksport kræver et aktivt Premium-abonnement eller en prøveperiode.',
    invalidStart: 'Skriv startdatoen som en gyldig dato i formatet ÅÅÅÅ-MM-DD.',
    invalidEnd: 'Skriv slutdatoen som en gyldig dato i formatet ÅÅÅÅ-MM-DD.',
    reversedRange: 'Startdatoen må ikke ligge efter slutdatoen.',
  },
} as const;

export function getConversationExportCopy(locale: SupportedLocale) {
  return locale === 'da' ? copy.da : copy.en;
}

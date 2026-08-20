export const english = {
  'app.loading': 'Opening TalkTwo…',
  'language.system': 'System language',
  'language.english': 'English',
  'language.danish': 'Danish',
  'login.tagline': 'A calmer place for difficult conversations.',
  'login.before': 'Before you begin',
  'login.step1': 'Invite the people you choose. Extra members join only after everyone already in the chat approves.',
  'login.step2': 'You decide when to open sensitive messages. Blocking is private and affects future messages.',
  'login.step3': 'Names, colours and conversation appearance stay local to your device. Readable exports are always an explicit choice.',
  'login.safety': 'TalkTwo supports calmer communication. It is not emergency, medical, legal or crisis support.',
  'login.title': 'Sign in',
  'login.help': 'Enter your email. We will send you a secure sign-in link. No password needed.',
  'login.emailLabel': 'Email address',
  'login.sendLabel': 'Email me a sign-in link',
  'login.sending': 'Sending…',
  'login.sent': 'We sent a sign-in link to:',
  'login.openEmail': 'Open the email on this phone and tap “Sign in”. TalkTwo should open automatically.',
  'login.anotherEmail': 'Use another email',
  'login.errorTitle': 'Could not send sign-in email',
  'common.tryAgain': 'Please try again.',
  'account.back': '‹ Back',
  'account.title': 'Account & privacy',
  'account.languageTitle': 'Language',
  'account.languageHelp': 'Choose TalkTwo’s language on this device. English is used when a translation is unavailable.',
  'account.notificationsTitle': 'Private message notifications',
  'account.notificationsBody': 'TalkTwo can notify you when a message becomes available. Alerts never include message text, sender names or document names, and are never sent before your communication window opens.',
  'account.permission': 'System permission: {permission}. You can also turn TalkTwo notifications off in device settings.',
  'account.notificationsOn': 'Notifications on',
  'account.notificationsOff': 'Turn on notifications',
  'account.updating': 'Updating…',
  'account.deleteTitle': 'Delete TalkTwo account',
  'account.deleteBody1': 'Deletion removes your account, profile, chat memberships, settings and server-side messages involving your account. It also removes this account’s decrypted local messages and conversation keys from this device.',
  'account.deleteBody2': 'Other people may still have messages they already opened on their own devices. TalkTwo cannot remotely erase private data stored on somebody else’s phone.',
  'account.deleteBody3': 'Deleting TalkTwo does not cancel an Apple App Store or Google Play subscription. Cancel an active subscription in the store to stop future charges.',
  'account.deleteWarning': 'This is permanent. A new account using the same email will not recover deleted chats or encryption keys.',
  'account.deleteType': 'Type {confirmation} to continue',
  'account.deleteButton': 'Delete account permanently',
  'account.deleting': 'Deleting account…',
} as const;

export type TranslationKey = keyof typeof english;

export const danish: Record<TranslationKey, string> = {
  'app.loading': 'Åbner TalkTwo…',
  'language.system': 'Systemets sprog',
  'language.english': 'Engelsk',
  'language.danish': 'Dansk',
  'login.tagline': 'Et roligere sted til svære samtaler.',
  'login.before': 'Før du begynder',
  'login.step1': 'Invitér de personer, du vælger. Ekstra medlemmer kommer først med, når alle i chatten har godkendt det.',
  'login.step2': 'Du bestemmer, hvornår du åbner følsomme beskeder. Blokering er privat og påvirker fremtidige beskeder.',
  'login.step3': 'Navne, farver og samtalens udseende bliver på din enhed. Læsbare eksporter er altid et aktivt valg.',
  'login.safety': 'TalkTwo støtter roligere kommunikation. Appen er ikke akut-, læge-, juridisk eller krisehjælp.',
  'login.title': 'Log ind',
  'login.help': 'Indtast din e-mail. Vi sender et sikkert loginlink. Du behøver ingen adgangskode.',
  'login.emailLabel': 'E-mailadresse',
  'login.sendLabel': 'Send mig et loginlink',
  'login.sending': 'Sender…',
  'login.sent': 'Vi har sendt et loginlink til:',
  'login.openEmail': 'Åbn e-mailen på denne telefon, og tryk på “Log ind”. TalkTwo bør åbne automatisk.',
  'login.anotherEmail': 'Brug en anden e-mail',
  'login.errorTitle': 'Loginmailen kunne ikke sendes',
  'common.tryAgain': 'Prøv igen.',
  'account.back': '‹ Tilbage',
  'account.title': 'Konto og privatliv',
  'account.languageTitle': 'Sprog',
  'account.languageHelp': 'Vælg TalkTwos sprog på denne enhed. Engelsk bruges, hvis en oversættelse mangler.',
  'account.notificationsTitle': 'Private beskednotifikationer',
  'account.notificationsBody': 'TalkTwo kan give dig besked, når en besked bliver tilgængelig. Notifikationer indeholder aldrig beskedtekst, afsendernavne eller dokumentnavne og sendes aldrig før dit kommunikationsvindue åbner.',
  'account.permission': 'Systemtilladelse: {permission}. Du kan også slå TalkTwo-notifikationer fra i enhedens indstillinger.',
  'account.notificationsOn': 'Notifikationer er slået til',
  'account.notificationsOff': 'Slå notifikationer til',
  'account.updating': 'Opdaterer…',
  'account.deleteTitle': 'Slet TalkTwo-konto',
  'account.deleteBody1': 'Sletning fjerner din konto, profil, chatmedlemskaber, indstillinger og serverbeskeder, der involverer din konto. Den fjerner også kontoens dekrypterede lokale beskeder og samtalenøgler fra denne enhed.',
  'account.deleteBody2': 'Andre kan stadig have beskeder, de allerede har åbnet på deres egne enheder. TalkTwo kan ikke fjernslette private data på en andens telefon.',
  'account.deleteBody3': 'Sletning af TalkTwo opsiger ikke et abonnement i Apple App Store eller Google Play. Opsig et aktivt abonnement i butikken for at stoppe fremtidige betalinger.',
  'account.deleteWarning': 'Dette er permanent. En ny konto med samme e-mail kan ikke gendanne slettede chats eller krypteringsnøgler.',
  'account.deleteType': 'Skriv {confirmation} for at fortsætte',
  'account.deleteButton': 'Slet kontoen permanent',
  'account.deleting': 'Sletter konto…',
};

export type SupportedLocale = 'en' | 'da';

export function resolveSupportedLocale(languageCode: string | null | undefined): SupportedLocale {
  return languageCode?.toLowerCase() === 'da' ? 'da' : 'en';
}

export function translate(locale: SupportedLocale, key: TranslationKey, values: Record<string, string | number> = {}) {
  const template = (locale === 'da' ? danish[key] : undefined) ?? english[key];
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
}

import type { SupportedLocale } from './translations';

const english = {
  semanticLimit: 'The Free filter uses simple mechanical checks only. It does not try to understand the meaning of your message. It checks length, exclamation marks, emoji/emoticons, obvious English/Danish profanity or direct insults, excessive capitals and simple repetition.',
};

const danish = {
  semanticLimit: 'Gratisfilteret bruger kun enkle mekaniske regler. Det prøver ikke at forstå meningen i din besked. Det kontrollerer længde, udråbstegn, emoji/emoticons, tydelige danske/engelske bandeord eller direkte skældsord, overdreven brug af store bogstaver og simple gentagelser.',
};

export function getFreeFilterCopy(locale: SupportedLocale) {
  return locale === 'da' ? danish : english;
}

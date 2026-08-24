import type { SupportedLocale } from './translations';

const english = {
  semanticLimit: 'Free semantic tone checks are quality-tested for English and Danish. Other message languages still receive universal checks such as length, exclamation marks, emoji and excessive capitals.',
};

const danish = {
  semanticLimit: 'Free-versionens semantiske tonekontrol er kvalitetstestet på dansk og engelsk. Andre beskedsprog får stadig universelle kontroller som længde, udråbstegn, emoji og overdreven brug af store bogstaver.',
};

export function getFreeFilterCopy(locale: SupportedLocale) {
  return locale === 'da' ? danish : english;
}

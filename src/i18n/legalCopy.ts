type PublicInfoCopy = {
  title: string;
  help: string;
  privacy: string;
  terms: string;
  support: string;
  deleteAccount: string;
  openErrorTitle: string;
  openErrorBody: string;
};

const english: PublicInfoCopy = {
  title: 'Public information',
  help: 'These links are shown only when TalkTwo has a configured live HTTPS support site.',
  privacy: 'Privacy policy',
  terms: 'Terms',
  support: 'Support',
  deleteAccount: 'Delete account on the web',
  openErrorTitle: 'Could not open link',
  openErrorBody: 'Please try again later.',
};

const danish: PublicInfoCopy = {
  title: 'Offentlig information',
  help: 'Disse links vises kun, når TalkTwo har et konfigureret aktivt HTTPS-supportsite.',
  privacy: 'Privatlivspolitik',
  terms: 'Vilkår',
  support: 'Support',
  deleteAccount: 'Slet konto på nettet',
  openErrorTitle: 'Kunne ikke åbne linket',
  openErrorBody: 'Prøv igen senere.',
};

export function getPublicInfoCopy(locale: string): PublicInfoCopy {
  return locale === 'da' ? danish : english;
}

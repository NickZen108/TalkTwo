import type { SupportedLocale } from './translations';

export interface CoachCopy {
  title: string;
  help: string;
  privacy: string;
  on: string;
  off: string;
  updating: string;
  statsTitle: string;
  reviewed: string;
  green: string;
  yellow: string;
  blocked: string;
  blockedRate: string;
  noReviews: string;
  unavailableTitle: string;
  unavailableBody: string;
}

const english: CoachCopy = {
  title: 'Coach',
  help: 'Coach is optional. When it is on, Premium AI may offer a calmer rewrite after reviewing your message.',
  privacy: 'Your statistics are yours only. TalkTwo stores aggregate counts, not a history of message text or comparisons with another person.',
  on: 'Coach on',
  off: 'Turn on Coach',
  updating: 'Updating…',
  statsTitle: 'Your review statistics',
  reviewed: 'Reviewed',
  green: 'Ready',
  yellow: 'Caution',
  blocked: 'Blocked',
  blockedRate: 'Blocked rate',
  noReviews: 'No Premium message reviews yet.',
  unavailableTitle: 'Coach',
  unavailableBody: 'Coach requires an active Premium plan or trial.',
};

const danish: CoachCopy = {
  title: 'Coach',
  help: 'Coach er valgfri. Når den er slået til, kan Premium-AI foreslå en roligere omskrivning efter at have vurderet din besked.',
  privacy: 'Din statistik er kun din. TalkTwo gemmer kun samlede tal – ikke en historik over beskedtekst og ingen sammenligning med den anden person.',
  on: 'Coach slået til',
  off: 'Slå Coach til',
  updating: 'Opdaterer…',
  statsTitle: 'Din vurderingsstatistik',
  reviewed: 'Vurderet',
  green: 'Klar',
  yellow: 'Forsigtig',
  blocked: 'Blokeret',
  blockedRate: 'Andel blokeret',
  noReviews: 'Ingen Premium-beskeder er vurderet endnu.',
  unavailableTitle: 'Coach',
  unavailableBody: 'Coach kræver et aktivt Premium-abonnement eller en prøveperiode.',
};

export function getCoachCopy(locale: SupportedLocale) {
  return locale === 'da' ? danish : english;
}

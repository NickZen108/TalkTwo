export type ExtraMemberRole = 'observer' | 'participant';

export const EXTRA_MEMBER_PRICES_DKK = {
  observer: 29,
  participant: 99,
} as const;

export const EXTRA_MEMBER_BILLING = {
  interval: 'month',
  intervalCount: 1,
  autoRenew: true,
  scope: 'account',
} as const;

export function extraMemberMonthlyPrice(role: ExtraMemberRole) {
  return EXTRA_MEMBER_PRICES_DKK[role];
}

export function extraMemberAccessCovers(currentRole: ExtraMemberRole, requestedRole: ExtraMemberRole) {
  return currentRole === 'participant' || requestedRole === 'observer';
}

export function proratedObserverUpgradeDkk(periodStartMs: number, periodEndMs: number, nowMs: number) {
  if (periodEndMs <= periodStartMs || nowMs >= periodEndMs) return 0;
  const total = periodEndMs - periodStartMs;
  const remaining = Math.max(0, periodEndMs - Math.max(nowMs, periodStartMs));
  const fullDifference = EXTRA_MEMBER_PRICES_DKK.participant - EXTRA_MEMBER_PRICES_DKK.observer;
  return Math.ceil((fullDifference * remaining) / total);
}

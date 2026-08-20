export type StorePlatform = 'apple' | 'google';
export type StoreProductKind = 'subscription' | 'one_time';

export const STORE_PRODUCTS = {
  premium_individual_monthly: {
    kind: 'subscription',
    appleProductId: 'com.talktwo.premium.individual.monthly',
    googleProductId: 'premium_individual_monthly',
    expectedDkk: 59,
  },
  premium_two_monthly: {
    kind: 'subscription',
    appleProductId: 'com.talktwo.premium.two.monthly',
    googleProductId: 'premium_two_monthly',
    expectedDkk: 99,
  },
  premium_two_annual: {
    kind: 'subscription',
    appleProductId: 'com.talktwo.premium.two.annual',
    googleProductId: 'premium_two_annual',
    expectedDkk: 799,
  },
  extra_observer_monthly: {
    kind: 'subscription',
    appleProductId: 'com.talktwo.extra.observer.monthly',
    googleProductId: 'extra_observer_monthly',
    expectedDkk: 29,
  },
  extra_participant_monthly: {
    kind: 'subscription',
    appleProductId: 'com.talktwo.extra.participant.monthly',
    googleProductId: 'extra_participant_monthly',
    expectedDkk: 99,
  },
  premium_gift_1m: {
    kind: 'one_time',
    appleProductId: 'com.talktwo.premium.gift.1m',
    googleProductId: 'premium_gift_1m',
    expectedDkk: 59,
  },
} as const;

export type StoreProductKey = keyof typeof STORE_PRODUCTS;

export function productIdFor(platform: StorePlatform, key: StoreProductKey) {
  const product = STORE_PRODUCTS[key];
  return platform === 'apple' ? product.appleProductId : product.googleProductId;
}

export function storeProductKeyForId(platform: StorePlatform, productId: string): StoreProductKey | null {
  for (const [key, product] of Object.entries(STORE_PRODUCTS) as Array<[StoreProductKey, (typeof STORE_PRODUCTS)[StoreProductKey]]>) {
    if ((platform === 'apple' ? product.appleProductId : product.googleProductId) === productId) return key;
  }
  return null;
}

export function productIdsByKind(platform: StorePlatform, kind: StoreProductKind) {
  return (Object.entries(STORE_PRODUCTS) as Array<[StoreProductKey, (typeof STORE_PRODUCTS)[StoreProductKey]]>)
    .filter(([, product]) => product.kind === kind)
    .map(([key]) => productIdFor(platform, key));
}

export function subscriptionProductIdsFor(platform: StorePlatform) {
  return productIdsByKind(platform, 'subscription');
}

export function oneTimeProductIdsFor(platform: StorePlatform) {
  return productIdsByKind(platform, 'one_time');
}

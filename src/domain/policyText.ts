// Policy checks should see compatibility-equivalent text and should not be bypassable
// with invisible formatting controls. This transformation is for matching only: the
// visible/stored message remains exactly what the user typed (apart from existing trim
// behavior at the send boundary).
//
// Cf covers zero-width/bidi/tag formatting characters. CGJ and variation selectors are
// combining marks rather than Cf, so remove them explicitly as well. Emoji detection
// must run on the original text before this canonical form is used.
const POLICY_IGNORABLES = /[\p{Cf}\u034F\u180B-\u180D\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu;

export function normalizePolicyText(value: string) {
  return value.normalize('NFKC').replace(POLICY_IGNORABLES, '');
}

export function hasPolicyIgnorables(value: string) {
  const normalized = value.normalize('NFKC');
  return normalized !== normalized.replace(POLICY_IGNORABLES, '');
}

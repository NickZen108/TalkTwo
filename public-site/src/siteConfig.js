const values = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim() ?? '',
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
  legalEntity: import.meta.env.VITE_LEGAL_ENTITY?.trim() ?? '',
  postalAddress: import.meta.env.VITE_POSTAL_ADDRESS?.trim() ?? '',
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL?.trim() ?? '',
  privacyEmail: import.meta.env.VITE_PRIVACY_EMAIL?.trim() ?? '',
  minimumAgeRule: import.meta.env.VITE_MINIMUM_AGE_RULE?.trim() ?? '',
  professionalServicesWording: import.meta.env.VITE_PROFESSIONAL_SERVICES_WORDING?.trim() ?? '',
  consumerRightsText: import.meta.env.VITE_CONSUMER_RIGHTS_TEXT?.trim() ?? '',
  governingLawText: import.meta.env.VITE_GOVERNING_LAW_TEXT?.trim() ?? '',
  internationalTransferText: import.meta.env.VITE_INTERNATIONAL_TRANSFER_TEXT?.trim() ?? '',
  privacyEffectiveDate: import.meta.env.VITE_PRIVACY_EFFECTIVE_DATE?.trim() ?? '',
};

const publicationApproved = import.meta.env.VITE_PUBLICATION_APPROVED?.trim().toLowerCase() === 'true';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nonPlaceholder(value) {
  return typeof value === 'string' && value.length > 0 && !/replace[- ]with|not configured|example\.com/i.test(value);
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validPublishableKey(value) {
  return /^sb_publishable_[A-Za-z0-9_-]+$/.test(value);
}

export function publicSiteConfig() {
  return { ...values };
}

export function missingPublicationFields(config = values, approved = publicationApproved) {
  const missing = [];
  for (const [key, value] of Object.entries(config)) {
    if (!nonPlaceholder(value)) missing.push(key);
  }
  if (config.supabaseUrl && !validHttpsUrl(config.supabaseUrl)) missing.push('supabaseUrl(valid https URL)');
  if (config.supabasePublishableKey && !validPublishableKey(config.supabasePublishableKey)) missing.push('supabasePublishableKey(current publishable key)');
  if (config.supportEmail && !emailPattern.test(config.supportEmail)) missing.push('supportEmail(valid email)');
  if (config.privacyEmail && !emailPattern.test(config.privacyEmail)) missing.push('privacyEmail(valid email)');
  if (!approved) missing.push('publicationApproved');
  return [...new Set(missing)];
}

export function publicationReady(config = values, approved = publicationApproved) {
  return missingPublicationFields(config, approved).length === 0;
}

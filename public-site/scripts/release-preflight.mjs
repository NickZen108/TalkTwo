import fs from 'node:fs';

const required = {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_SUPPORT_EMAIL: process.env.VITE_SUPPORT_EMAIL,
  VITE_PRIVACY_EMAIL: process.env.VITE_PRIVACY_EMAIL,
  VITE_LEGAL_ENTITY: process.env.VITE_LEGAL_ENTITY,
  VITE_POSTAL_ADDRESS: process.env.VITE_POSTAL_ADDRESS,
  VITE_MINIMUM_AGE_RULE: process.env.VITE_MINIMUM_AGE_RULE,
  VITE_PROFESSIONAL_SERVICES_WORDING: process.env.VITE_PROFESSIONAL_SERVICES_WORDING,
  VITE_CONSUMER_RIGHTS_TEXT: process.env.VITE_CONSUMER_RIGHTS_TEXT,
  VITE_GOVERNING_LAW_TEXT: process.env.VITE_GOVERNING_LAW_TEXT,
  VITE_INTERNATIONAL_TRANSFER_TEXT: process.env.VITE_INTERNATIONAL_TRANSFER_TEXT,
  VITE_PRIVACY_EFFECTIVE_DATE: process.env.VITE_PRIVACY_EFFECTIVE_DATE,
};

const errors = [];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nonPlaceholder(value) {
  return typeof value === 'string' && value.trim().length > 0 && !/replace[- ]with|not configured|example\.com/i.test(value);
}

function httpsUrl(value) {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function publishableSupabaseKey(value) {
  return typeof value === 'string' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(value.trim());
}

for (const [name, value] of Object.entries(required)) {
  if (!nonPlaceholder(value)) errors.push(`${name} is missing or still a placeholder.`);
}

if (required.VITE_SUPABASE_URL && !httpsUrl(required.VITE_SUPABASE_URL)) {
  errors.push('VITE_SUPABASE_URL must be a credential-free HTTPS URL.');
}
if (!publishableSupabaseKey(required.VITE_SUPABASE_PUBLISHABLE_KEY)) {
  errors.push('VITE_SUPABASE_PUBLISHABLE_KEY must be a current sb_publishable_ key; secret and legacy service-role keys are forbidden in the browser.');
}
for (const name of ['VITE_SUPPORT_EMAIL', 'VITE_PRIVACY_EMAIL']) {
  const value = required[name];
  if (value && !emailPattern.test(value)) errors.push(`${name} must be a valid email address.`);
}
if ((process.env.VITE_PUBLICATION_APPROVED ?? '').trim().toLowerCase() !== 'true') {
  errors.push('VITE_PUBLICATION_APPROVED must be true only after final legal/privacy review.');
}

const deletionSource = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
if (!/flowType:\s*['"]pkce['"]/.test(deletionSource)) {
  errors.push('Public account deletion must use Supabase PKCE authentication.');
}
if (!/shouldCreateUser:\s*false/.test(deletionSource)) {
  errors.push('Public account deletion must never create an account for an unknown email.');
}
if (!/supabase\.auth\.getUser\(\)/.test(deletionSource)) {
  errors.push('Public account deletion must re-verify the authenticated user before destructive action.');
}

const appFallback = fs.readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
if (/<script\b/i.test(appFallback)) {
  errors.push('/app/* fallback must remain script-free so possession-secret URL fragments are never read by site code.');
}
if (!/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']/i.test(appFallback)) {
  errors.push('/app/* fallback must keep a no-referrer policy.');
}

if (errors.length) {
  console.error('TalkTwo public-site release preflight failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('TalkTwo public-site release preflight OK.');

import fs from 'node:fs';

const requiredFiles = [
  'docs/START_HERE.md',
  'docs/USER_ONBOARDING_FLOW.md',
  'docs/ORGANIZATION_ADMIN_ONBOARDING.md',
  'docs/DEVELOPER_ONBOARDING.md',
  'docs/NEW_OWNER_ONBOARDING.md',
  'docs/HANDOVER_RUNBOOK.md',
  'docs/ASSET_REGISTER.md',
  'docs/ACCESS_ROLE_MODEL.md',
  'docs/PRIVACY_INVARIANTS.md',
  'docs/PRODUCT_SPEC_V1.md',
  'docs/PRODUCTION_DEPLOYMENT_PLAN.md',
  'docs/STORE_SETUP_CHECKLIST.md',
  'docs/STORE_SUBMISSION_PACK.md',
  'app.json',
  'eas.json',
];

const failures = [];

for (const path of requiredFiles) {
  if (!fs.existsSync(path)) failures.push(`Missing required handover artifact: ${path}`);
}

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

if (fs.existsSync('docs/ASSET_REGISTER.md')) {
  const assets = read('docs/ASSET_REGISTER.md');
  const requiredAssets = [
    'GitHub', 'Supabase', 'Expo / EAS', 'Apple Developer', 'Google Play',
    'domain + DNS', 'Support/privacy', 'AI provider', 'push credentials',
    'Store products', 'Organization sponsorship', 'Monitoring', 'Brand', 'Legal/privacy', 'Backups',
  ];
  for (const label of requiredAssets) {
    if (!assets.toLowerCase().includes(label.toLowerCase())) failures.push(`Asset register does not cover: ${label}`);
  }
  if (/@gmail\.com|@outlook\.com|@hotmail\.com|@icloud\.com/i.test(assets)) {
    failures.push('Asset register contains a personal mailbox; ownership targets must stay organization-neutral.');
  }
  if (/sb_secret_|service_role\s*[:=]\s*['"][^'"]+|sk-[A-Za-z0-9_-]{16,}/i.test(assets)) {
    failures.push('Asset register appears to contain a private credential.');
  }
}

if (fs.existsSync('docs/START_HERE.md')) {
  const start = read('docs/START_HERE.md');
  for (const path of requiredFiles.filter((path) => path.startsWith('docs/') && path.includes('ONBOARDING'))) {
    if (!start.includes(path)) failures.push(`START_HERE does not link ${path}`);
  }
  if (!/Administrative access is not conversation access/i.test(start)) {
    failures.push('START_HERE is missing the administrative-access privacy boundary.');
  }
}

if (fs.existsSync('docs/HANDOVER_RUNBOOK.md')) {
  const handover = read('docs/HANDOVER_RUNBOOK.md');
  for (const phrase of ['rotate every production credential', 'Prove independent operation', 'Revoke seller access']) {
    if (!handover.toLowerCase().includes(phrase.toLowerCase())) failures.push(`Handover runbook is missing: ${phrase}`);
  }
}

if (fs.existsSync('docs/NEW_OWNER_ONBOARDING.md')) {
  const owner = read('docs/NEW_OWNER_ONBOARDING.md');
  for (const phrase of ['independent operation', 'buyer-controlled identities', 'rotate every secret', 'remove the seller']) {
    if (!owner.toLowerCase().includes(phrase.toLowerCase())) failures.push(`New-owner onboarding is missing: ${phrase}`);
  }
}

if (fs.existsSync('docs/ORGANIZATION_ADMIN_ONBOARDING.md')) {
  const org = read('docs/ORGANIZATION_ADMIN_ONBOARDING.md');
  if (!/Paying for access does not grant monitoring rights/i.test(org)) {
    failures.push('Organisation onboarding is missing the no-monitoring rule.');
  }
  if (!/do not expose Supabase dashboards or `service_role` to customers/i.test(org)) {
    failures.push('Organisation onboarding does not prohibit raw infrastructure access.');
  }
}

if (fs.existsSync('app.json')) {
  const app = JSON.parse(read('app.json'));
  const ios = app?.expo?.ios?.bundleIdentifier;
  const android = app?.expo?.android?.package;
  if (!ios) failures.push('app.json has no iOS bundleIdentifier.');
  if (!android) failures.push('app.json has no Android package.');
  if (ios !== android) failures.push(`iOS/Android identifiers differ (${ios ?? 'missing'} vs ${android ?? 'missing'}); document the intentional difference before handover.`);
}

if (failures.length) {
  console.error('TalkTwo handover readiness FAILED:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('TalkTwo handover readiness OK.');

import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8' });
if (!result.stdout) {
  console.error('npm audit produced no JSON output.');
  console.error(result.stderr || '');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch (error) {
  console.error('Could not parse npm audit output.', error);
  console.error(result.stdout);
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const allowedBuildOnlyAdvisories = new Set([
  'GHSA-w3rx-r6r6-pgpr', // image-size ICNS parser DoS; no patched npm release as of 2026-08-20
  'GHSA-5p2g-fcmc-qvqq', // image-size JXL/HEIF parser DoS; no patched npm release as of 2026-08-20
]);

function collectLeafAdvisories(packageName, seen = new Set()) {
  if (seen.has(packageName)) return new Set();
  seen.add(packageName);
  const item = vulnerabilities[packageName];
  const ids = new Set();
  if (!item) return ids;
  for (const via of item.via ?? []) {
    if (typeof via === 'string') {
      for (const id of collectLeafAdvisories(via, seen)) ids.add(id);
      continue;
    }
    const match = String(via.url ?? '').match(/GHSA-[a-z0-9-]+/i);
    if (match) ids.add(match[0]);
  }
  return ids;
}

const severe = Object.entries(vulnerabilities).filter(([, item]) => ['high', 'critical'].includes(item.severity));
const blocked = [];
const accepted = [];

for (const [name, item] of severe) {
  const advisories = [...collectLeafAdvisories(name)];
  const isKnownBuildOnlyClosure = advisories.length > 0 && advisories.every((id) => allowedBuildOnlyAdvisories.has(id));
  if (isKnownBuildOnlyClosure) accepted.push({ name, severity: item.severity, advisories });
  else blocked.push({ name, severity: item.severity, advisories });
}

if (accepted.length) {
  console.warn('Known Expo/Metro build-time advisory closure accepted temporarily:');
  for (const item of accepted) console.warn(`- ${item.name}: ${item.severity} (${item.advisories.join(', ')})`);
  console.warn('Rationale: these image parsers are reached through Expo/Metro build tooling, not TalkTwo message or attachment runtime paths, and no patched image-size npm release is currently available. Re-check on every CI run.');
}

const metadata = report.metadata?.vulnerabilities;
if (metadata) {
  console.log(`npm audit totals: low=${metadata.low ?? 0}, moderate=${metadata.moderate ?? 0}, high=${metadata.high ?? 0}, critical=${metadata.critical ?? 0}`);
}

if (blocked.length) {
  console.error('Unaccepted high/critical runtime dependency findings:');
  for (const item of blocked) console.error(`- ${item.name}: ${item.severity}${item.advisories.length ? ` (${item.advisories.join(', ')})` : ''}`);
  process.exit(1);
}

console.log('Runtime dependency audit gate passed.');

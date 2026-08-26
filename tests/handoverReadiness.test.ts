import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const script = 'scripts/check-handover-readiness.mjs';

test('handover readiness guard is executable and currently green', () => {
  assert.ok(fs.existsSync(script));
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /TalkTwo handover readiness OK\./i);
});

test('package exposes handover check and includes it in the local qa command', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts['handover:check'], 'node scripts/check-handover-readiness.mjs');
  assert.match(pkg.scripts.qa, /npm run handover:check/);
});

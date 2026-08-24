import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/typecheck.yml', 'utf8');

test('QA runs for stacked pull requests while pushes remain main-only', () => {
  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/i);
  assert.match(workflow, /pull_request:\s*\{\}/i);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/i);
});

test('QA uses current non-Node-20 action majors', () => {
  assert.match(workflow, /actions\/checkout@v7/i);
  assert.match(workflow, /actions\/setup-node@v7/i);
  assert.match(workflow, /actions\/setup-java@v5/i);
  assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node|setup-java)@v4/i);
});

test('QA validates public site and both Android release artifacts', () => {
  assert.match(workflow, /working-directory:\s*public-site/i);
  assert.match(workflow, /npm run build/i);
  assert.match(workflow, /assembleRelease bundleRelease/i);
  assert.match(workflow, /app-release\.apk/i);
  assert.match(workflow, /app-release\.aab/i);
  assert.match(workflow, /check-android-permissions\.mjs --merged --release/i);
  assert.match(workflow, /expo prebuild --platform ios/i);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));

test('production builds use EAS remote developer-facing versions with auto-increment', () => {
  assert.equal(eas.cli?.appVersionSource, 'remote');
  assert.equal(eas.build?.production?.autoIncrement, true);
});

test('user-facing app version remains explicit in app config', () => {
  assert.match(app.expo?.version ?? '', /^\d+\.\d+\.\d+$/);
});

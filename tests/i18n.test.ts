import assert from 'node:assert/strict';
import test from 'node:test';
import { danish, english, resolveSupportedLocale, translate } from '../src/i18n/translations';

test('Danish has exact key parity with the English fallback catalogue', () => {
  assert.deepEqual(Object.keys(danish).sort(), Object.keys(english).sort());
  for (const [key, value] of Object.entries(danish)) {
    assert.ok(value.trim(), `${key} has an empty Danish translation`);
  }
});

test('locale resolution supports Danish and falls back to English', () => {
  assert.equal(resolveSupportedLocale('da'), 'da');
  assert.equal(resolveSupportedLocale('DA'), 'da');
  assert.equal(resolveSupportedLocale('en'), 'en');
  assert.equal(resolveSupportedLocale('de'), 'en');
  assert.equal(resolveSupportedLocale(null), 'en');
});

test('translations substitute named values without evaluating content', () => {
  assert.equal(translate('en', 'account.permission', { permission: 'granted' }), 'System permission: granted. You can also turn TalkTwo notifications off in device settings.');
  assert.equal(translate('da', 'account.deleteType', { confirmation: 'DELETE' }), 'Skriv DELETE for at fortsætte');
});

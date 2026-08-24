import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNoSymbolicTone, symbolicToneKind } from '../src/domain/symbolicTone';

for (const [value, kind] of [
  ['Hej 🙂', 'emoji'],
  ['Okay :-)', 'emoticon'],
  ['Fint :)', 'emoticon'],
  ['Tak ^_^', 'emoticon'],
  ['Godt <3', 'emoticon'],
] as const) {
  test(`symbolic tone is blocked: ${value}`, () => {
    assert.equal(symbolicToneKind(value), kind);
    assert.throws(() => assertNoSymbolicTone(value), /not allowed/i);
  });
}

test('neutral punctuation and clock times remain allowed', () => {
  for (const value of ['Henter kl. 17:30.', 'Kan du hente kl. 8?', 'Tak for beskeden.', 'See you at 18:15.']) {
    assert.equal(symbolicToneKind(value), null, value);
    assert.doesNotThrow(() => assertNoSymbolicTone(value));
  }
});

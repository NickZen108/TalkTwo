import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { countMessageCharacters, evaluateFreeMessage, FREE_PROFANITY_LANGUAGES } from '../src/filter/freeFilter';
import { normalizePolicyText } from '../src/domain/policyText';

const cases: Array<{ message: string; canSend: boolean }> = [
  { message: 'Pickup at 17.', canSend: true },
  { message: 'Can you send the address again?', canSend: true },
  { message: 'Kan du sende adressen igen?', canSend: true },
  { message: 'You are always late.', canSend: true },
  { message: 'Du er altid forsinket.', canSend: true },
  { message: 'You were late again.', canSend: true },
  { message: 'I feel hurt.', canSend: true },
  { message: 'Jeg føler mig såret.', canSend: true },
  { message: 'We can meet at 17:00.', canSend: true },
  { message: 'CPR is in the folder.', canSend: true },
  { message: 'Pickup at 17!', canSend: false },
  { message: 'Pickup 🙂', canSend: false },
  { message: 'Pickup 🇩🇰', canSend: false },
  { message: 'Pickup 1️⃣', canSend: false },
  { message: 'Pickup ©️', canSend: false },
  { message: 'Pickup :)', canSend: false },
  { message: 'Pickup <3', canSend: false },
  { message: 'You are an idiot.', canSend: false },
  { message: 'Det er fandme dumt.', canSend: false },
  { message: 'This is bullshit.', canSend: false },
  { message: 'hold kæft', canSend: false },
  { message: 'PICKUP AT SEVENTEEN', canSend: false },
  { message: 'STORE BOGSTAVER', canSend: false },
  { message: 'nej nej nej', canSend: false },
  { message: 'why???', canSend: false },
  { message: 'nuuuu', canSend: false },
];

for (const item of cases) {
  test(`${item.canSend ? 'allows' : 'blocks'}: ${item.message}`, () => {
    assert.equal(evaluateFreeMessage(item.message).canSend, item.canSend);
  });
}

test('declares profanity matching as Danish and English without semantic-language claims', () => {
  assert.deepEqual([...FREE_PROFANITY_LANGUAGES], ['en', 'da']);
});

test('policy canonicalization removes invisible formatting controls without changing stored text', () => {
  assert.equal(normalizePolicyText('f\u200Buck'), 'fuck');
  assert.equal(normalizePolicyText('Pickup！'), 'Pickup!');
});

test('invisible and compatibility characters cannot bypass simple Free rules', () => {
  assert.equal(evaluateFreeMessage('This is f\u200Buck.').canSend, false);
  assert.equal(evaluateFreeMessage('Pickup at 17！').canSend, false);
});

test('onboarding copy explains that the Free filter is mechanical rather than semantic', () => {
  const login = fs.readFileSync('src/screens/LoginScreen.tsx', 'utf8');
  const copy = fs.readFileSync('src/i18n/freeFilterCopy.ts', 'utf8');
  assert.match(login, /freeFilterCopy\.semanticLimit/i);
  assert.match(copy, /simple mechanical checks only/i);
  assert.match(copy, /enkle mekaniske regler/i);
  assert.match(copy, /does not try to understand the meaning/i);
});

test('counts Unicode code points rather than UTF-16 units', () => {
  assert.equal(countMessageCharacters('A🙂B'), 3);
});

test('blocks over 160 Unicode characters', () => {
  assert.equal(evaluateFreeMessage('ab'.repeat(81)).canSend, false);
});

test('allows exactly 160 neutral characters', () => {
  assert.equal(evaluateFreeMessage('ab'.repeat(80)).canSend, true);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { countMessageCharacters, evaluateFreeMessage, FREE_SEMANTIC_LANGUAGES } from '../src/filter/freeFilter';
import { normalizePolicyText } from '../src/domain/policyText';

const cases: Array<{ message: string; canSend: boolean }> = [
  { message: 'Pickup at 17.', canSend: true },
  { message: 'Can you send the address again?', canSend: true },
  { message: 'Kan du sende adressen igen?', canSend: true },
  { message: 'The booking is for Neverland Street 4.', canSend: true },
  { message: 'Det gælder Altiden 4.', canSend: true },
  { message: 'We can meet at 17:00.', canSend: true },
  { message: 'Shiitake is on the shopping list.', canSend: true },
  { message: 'You are welcome to collect at 5.', canSend: true },
  { message: 'Du er velkommen til at hente kl. 17.', canSend: true },
  { message: 'You are always late.', canSend: false },
  { message: 'Du er altid forsinket.', canSend: false },
  { message: 'You were late again.', canSend: false },
  { message: 'Du kom for sent igen.', canSend: false },
  { message: 'I feel hurt.', canSend: false },
  { message: 'Jeg føler mig såret.', canSend: false },
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
  { message: 'PICKUP AT SEVENTEEN', canSend: false },
];

for (const item of cases) {
  test(`${item.canSend ? 'allows' : 'blocks'}: ${item.message}`, () => {
    assert.equal(evaluateFreeMessage(item.message).canSend, item.canSend);
  });
}

test('declares English and Danish as the quality-tested semantic languages', () => {
  assert.deepEqual([...FREE_SEMANTIC_LANGUAGES], ['en', 'da']);
});

test('universal checks still apply to otherwise unsupported message languages', () => {
  assert.equal(evaluateFreeMessage('Recogida a las 17.').canSend, true);
  assert.equal(evaluateFreeMessage('Recogida a las 17!').canSend, false);
  assert.equal(evaluateFreeMessage('Recogida 🙂').canSend, false);
  assert.equal(evaluateFreeMessage('RECOGIDA A LAS DIECISIETE').canSend, false);
});

test('policy canonicalization removes invisible formatting controls without changing stored text', () => {
  assert.equal(normalizePolicyText('a\u200Blways'), 'always');
  assert.equal(normalizePolicyText('ne\u202Ever'), 'never');
  assert.equal(normalizePolicyText('Pickup！'), 'Pickup!');
});

test('invisible and compatibility characters cannot bypass Free rules', () => {
  assert.equal(evaluateFreeMessage('You are a\u200Blways late.').canSend, false);
  assert.equal(evaluateFreeMessage('This is f\u200Buck.').canSend, false);
  assert.equal(evaluateFreeMessage('Pickup at 17！').canSend, false);
  assert.equal(evaluateFreeMessage('You are ne\u202Ever late.').canSend, false);
});

test('the onboarding copy discloses the semantic language limitation', () => {
  const login = fs.readFileSync('src/screens/LoginScreen.tsx', 'utf8');
  const copy = fs.readFileSync('src/i18n/freeFilterCopy.ts', 'utf8');
  assert.match(login, /freeFilterCopy\.semanticLimit/i);
  assert.match(copy, /quality-tested for English and Danish/i);
  assert.match(copy, /kvalitetstestet på dansk og engelsk/i);
  assert.match(copy, /universal checks/i);
});

test('counts Unicode code points rather than UTF-16 units', () => {
  assert.equal(countMessageCharacters('A🙂B'), 3);
});

test('blocks over 160 Unicode characters', () => {
  assert.equal(evaluateFreeMessage('a'.repeat(161)).canSend, false);
});

test('allows exactly 160 neutral Unicode characters', () => {
  assert.equal(evaluateFreeMessage('a'.repeat(160)).canSend, true);
});

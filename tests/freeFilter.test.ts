import assert from 'node:assert/strict';
import test from 'node:test';
import { countMessageCharacters, evaluateFreeMessage } from '../src/filter/freeFilter';

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

test('counts Unicode code points rather than UTF-16 units', () => {
  assert.equal(countMessageCharacters('A🙂B'), 3);
});

test('blocks over 160 Unicode characters', () => {
  assert.equal(evaluateFreeMessage('a'.repeat(161)).canSend, false);
});

test('allows exactly 160 neutral Unicode characters', () => {
  assert.equal(evaluateFreeMessage('a'.repeat(160)).canSend, true);
});

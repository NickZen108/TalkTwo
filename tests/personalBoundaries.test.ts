import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findMatchingPersonalBoundary,
  MAX_PERSONAL_BOUNDARIES,
  normalizePersonalBoundary,
  validatePersonalBoundary,
} from '../src/domain/personalBoundaries';

test('personal boundary policy stays capped at ten entries', () => {
  assert.equal(MAX_PERSONAL_BOUNDARIES, 10);
});

test('normalization is case, punctuation and whitespace insensitive', () => {
  assert.equal(normalizePersonalBoundary('  Du  er—umulig! '), 'du er umulig');
  assert.equal(normalizePersonalBoundary('KLASSEN'), 'klassen');
});

test('matching uses complete words and prefers the longest phrase', () => {
  assert.equal(findMatchingPersonalBoundary('Du er en idiot!', ['idiot', 'du er en idiot']), 'du er en idiot');
  assert.equal(findMatchingPersonalBoundary('Skoleklassen mødes', ['le']), null);
  assert.equal(findMatchingPersonalBoundary('Det er KLAR.', ['klar']), 'klar');
  assert.equal(findMatchingPersonalBoundary('Det er KLART.', ['klar']), null);
});

test('validation rejects essential single logistics terms and unsafe shapes', () => {
  assert.match(validatePersonalBoundary('school').error ?? '', /essential logistics/i);
  assert.match(validatePersonalBoundary('børn').error ?? '', /essential logistics/i);
  assert.match(validatePersonalBoundary('one two three four five six').error ?? '', /five words/i);
  assert.match(validatePersonalBoundary('!').error ?? '', /two letters or numbers/i);
  assert.equal(validatePersonalBoundary('du er ligeglad').valid, true);
});

import { normalizePolicyText } from './policyText';

export const MAX_PERSONAL_BOUNDARIES = 10;
export const MAX_PERSONAL_BOUNDARY_LENGTH = 40;

const ESSENTIAL_SINGLE_TERMS = new Set([
  'address', 'adresse', 'aflevering', 'akut', 'barn', 'børn', 'child', 'children',
  'doctor', 'dropoff', 'emergency', 'hospital', 'læge', 'medication', 'medicine',
  'medicin', 'nødsituation', 'phone', 'pickup', 'school', 'skole', 'telefon', 'urgent',
]);

export function normalizePersonalBoundary(value: string) {
  return normalizePolicyText(value)
    .toLocaleLowerCase('und')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function validatePersonalBoundary(value: string) {
  const display = value.trim().replace(/\s+/g, ' ');
  const normalized = normalizePersonalBoundary(display);

  if (!display) return { valid: false as const, display, normalized, error: 'Enter a word or short phrase.' };
  if (Array.from(display).length > MAX_PERSONAL_BOUNDARY_LENGTH) {
    return { valid: false as const, display, normalized, error: `Use at most ${MAX_PERSONAL_BOUNDARY_LENGTH} characters.` };
  }
  if (normalized.length < 2) return { valid: false as const, display, normalized, error: 'Use at least two letters or numbers.' };
  if (normalized.split(' ').length > 5) return { valid: false as const, display, normalized, error: 'Use at most five words.' };
  if (ESSENTIAL_SINGLE_TERMS.has(normalized)) {
    return { valid: false as const, display, normalized, error: 'This essential logistics word cannot be blocked on its own.' };
  }

  return { valid: true as const, display, normalized, error: null };
}

export function findMatchingPersonalBoundary(message: string, phrases: string[]) {
  const normalizedMessage = ` ${normalizePersonalBoundary(message)} `;
  return phrases
    .map((phrase) => ({ phrase, normalized: normalizePersonalBoundary(phrase) }))
    .filter((item) => item.normalized)
    .sort((a, b) => b.normalized.length - a.normalized.length)
    .find((item) => normalizedMessage.includes(` ${item.normalized} `))?.phrase ?? null;
}

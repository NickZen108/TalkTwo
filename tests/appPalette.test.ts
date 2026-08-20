import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_PALETTES, contrastRatio } from '../src/domain/appPalette';

const normalTextPairs = [
  ['text', 'background'],
  ['text', 'surface'],
  ['text', 'surfaceSoft'],
  ['muted', 'background'],
  ['muted', 'surface'],
  ['brand', 'background'],
  ['avatarText', 'avatar'],
  ['noticeText', 'notice'],
  ['inviteText', 'invite'],
  ['accentText', 'accentStrong'],
  ['reviewText', 'reviewGreen'],
  ['reviewText', 'reviewYellow'],
  ['reviewText', 'reviewRed'],
  ['reviewMuted', 'reviewGreen'],
  ['reviewMuted', 'reviewYellow'],
  ['reviewMuted', 'reviewRed'],
] as const;

test('light and dark palettes keep normal text at WCAG AA contrast', () => {
  for (const [mode, palette] of Object.entries(APP_PALETTES)) {
    for (const [foregroundKey, backgroundKey] of normalTextPairs) {
      const ratio = contrastRatio(palette[foregroundKey], palette[backgroundKey]);
      assert.ok(ratio >= 4.5, `${mode}: ${foregroundKey} on ${backgroundKey} has contrast ${ratio.toFixed(2)}`);
    }
  }
});

test('all app palette values are six-digit hex colours', () => {
  for (const [mode, palette] of Object.entries(APP_PALETTES)) {
    for (const [name, value] of Object.entries(palette)) {
      assert.match(value, /^#[0-9a-f]{6}$/i, `${mode}.${name} is not a six-digit hex colour`);
    }
  }
});

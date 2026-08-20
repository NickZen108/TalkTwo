import assert from 'node:assert/strict';
import test from 'node:test';
import { BACKGROUND_THEMES, BUBBLE_THEMES, initialsForName, safeBackgroundTheme, safeBubbleTheme, textColorForBackground } from '../src/domain/chatPresentation';

function channel(hex: string, start: number) {
  return Number.parseInt(hex.slice(start, start + 2), 16) / 255;
}

function linear(value: number) {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  return 0.2126 * linear(channel(hex, 1)) + 0.7152 * linear(channel(hex, 3)) + 0.0722 * linear(channel(hex, 5));
}

function contrast(a: string, b: string) {
  const light = Math.max(luminance(a), luminance(b));
  const dark = Math.min(luminance(a), luminance(b));
  return (light + 0.05) / (dark + 0.05);
}

test('initials work for one and multiple names', () => {
  assert.equal(initialsForName('Maya'), 'MA');
  assert.equal(initialsForName('Family Counselor'), 'FC');
  assert.equal(initialsForName('  '), '?');
});

test('unknown themes fall back safely', () => {
  assert.equal(safeBackgroundTheme('not-a-theme'), 'paper');
  assert.equal(safeBubbleTheme('not-a-theme'), 'sage');
});

test('every built-in bubble theme has WCAG AA normal-text contrast', () => {
  for (const theme of Object.values(BUBBLE_THEMES)) {
    const text = textColorForBackground(theme.background);
    assert.ok(contrast(theme.background, text) >= 4.5, `${theme.label} bubble contrast is too low`);
  }
});

test('every conversation background is a valid six-digit hex colour', () => {
  for (const theme of Object.values(BACKGROUND_THEMES)) {
    assert.match(theme.background, /^#[0-9a-f]{6}$/i);
  }
});

test('dark custom background gets white text', () => {
  assert.equal(textColorForBackground('#111111'), '#FFFFFF');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { BUBBLE_THEMES, initialsForName, safeBackgroundTheme, safeBubbleTheme, textColorForBackground } from '../src/domain/chatPresentation';

test('initials work for one and multiple names', () => {
  assert.equal(initialsForName('Maya'), 'MA');
  assert.equal(initialsForName('Family Counselor'), 'FC');
  assert.equal(initialsForName('  '), '?');
});

test('unknown themes fall back safely', () => {
  assert.equal(safeBackgroundTheme('not-a-theme'), 'paper');
  assert.equal(safeBubbleTheme('not-a-theme'), 'sage');
});

test('all built-in bubble themes choose readable dark text', () => {
  for (const theme of Object.values(BUBBLE_THEMES)) {
    assert.equal(textColorForBackground(theme.background), '#151515');
  }
});

test('dark custom background gets white text', () => {
  assert.equal(textColorForBackground('#111111'), '#FFFFFF');
});

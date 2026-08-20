export const BACKGROUND_THEMES = {
  paper: { label: 'Paper', background: '#F4F1EA', pattern: 'none' as const },
  sage: { label: 'Sage', background: '#E8EFE9', pattern: 'none' as const },
  sand: { label: 'Sand', background: '#F2E8D8', pattern: 'none' as const },
  sky: { label: 'Sky', background: '#E8EFF5', pattern: 'none' as const },
  dots: { label: 'Soft dots', background: '#F3F1EC', pattern: 'dots' as const },
  night: { label: 'Night', background: '#19201C', pattern: 'none' as const },
};

export type BackgroundThemeName = keyof typeof BACKGROUND_THEMES;

export const BUBBLE_THEMES = {
  sage: { label: 'Sage', background: '#DDECDD' },
  blue: { label: 'Blue', background: '#DCE9F4' },
  sand: { label: 'Sand', background: '#EEE2CE' },
  lilac: { label: 'Lilac', background: '#E9E0EF' },
  grey: { label: 'Grey', background: '#E6E6E3' },
  mint: { label: 'Mint', background: '#D9EEE8' },
};

export type BubbleThemeName = keyof typeof BUBBLE_THEMES;

export function initialsForName(name: string) {
  const clean = name.trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return Array.from(parts[0] ?? '?').slice(0, 2).join('').toLocaleUpperCase();
  return `${Array.from(parts[0] ?? '?')[0] ?? '?'}${Array.from(parts.at(-1) ?? '?')[0] ?? '?'}`.toLocaleUpperCase();
}

function channel(hex: string, start: number) {
  return Number.parseInt(hex.slice(start, start + 2), 16) / 255;
}

function linear(value: number) {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function textColorForBackground(background: string) {
  if (!/^#[0-9a-f]{6}$/i.test(background)) return '#161616';
  const luminance = 0.2126 * linear(channel(background, 1)) + 0.7152 * linear(channel(background, 3)) + 0.0722 * linear(channel(background, 5));
  return luminance > 0.48 ? '#151515' : '#FFFFFF';
}

export function safeBackgroundTheme(name: string): BackgroundThemeName {
  return name in BACKGROUND_THEMES ? name as BackgroundThemeName : 'paper';
}

export function safeBubbleTheme(name: string): BubbleThemeName {
  return name in BUBBLE_THEMES ? name as BubbleThemeName : 'sage';
}

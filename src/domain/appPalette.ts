export const APP_PALETTES = {
  light: {
    background: '#F7F7F4',
    surface: '#FFFFFF',
    surfaceSoft: '#F3F3F0',
    text: '#171717',
    muted: '#686863',
    subtle: '#7B7B75',
    border: '#DDDDD7',
    borderStrong: '#CFCFC9',
    brand: '#173F34',
    accent: '#1E6A52',
    accentStrong: '#1E5A48',
    accentText: '#FFFFFF',
    avatar: '#DFE8E2',
    avatarText: '#315245',
    notice: '#F2E9D6',
    noticeText: '#665B43',
    invite: '#E4F0E9',
    inviteText: '#173F34',
    input: '#FFFFFF',
    disabled: '#9A9A94',
    danger: '#A84646',
  },
  dark: {
    background: '#101311',
    surface: '#171C19',
    surfaceSoft: '#202622',
    text: '#F3F5F2',
    muted: '#B3BCB7',
    subtle: '#99A39E',
    border: '#343C37',
    borderStrong: '#4A554F',
    brand: '#9DDFC6',
    accent: '#66C5A0',
    accentStrong: '#2F7D63',
    accentText: '#FFFFFF',
    avatar: '#26342E',
    avatarText: '#CBEADD',
    notice: '#332C1E',
    noticeText: '#F0DEA9',
    invite: '#1D332A',
    inviteText: '#C8ECDD',
    input: '#1E2521',
    disabled: '#626B66',
    danger: '#E07A7A',
  },
} as const;

export type ResolvedAppearance = keyof typeof APP_PALETTES;
export type AppColors = (typeof APP_PALETTES)[ResolvedAppearance];

function channel(hex: string, start: number) {
  return Number.parseInt(hex.slice(start, start + 2), 16) / 255;
}

function linear(value: number) {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid colour: ${hex}`);
  return 0.2126 * linear(channel(hex, 1)) + 0.7152 * linear(channel(hex, 3)) + 0.0722 * linear(channel(hex, 5));
}

export function contrastRatio(foreground: string, background: string) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

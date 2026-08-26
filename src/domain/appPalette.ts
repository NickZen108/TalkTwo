export const APP_PALETTES = {
  light: {
    background: '#F5F7FA',
    surface: '#FFFFFF',
    surfaceSoft: '#EFF3F7',
    text: '#12202B',
    muted: '#4C5D6B',
    subtle: '#60717F',
    border: '#D5DEE6',
    borderStrong: '#BAC7D2',
    brand: '#123B5D',
    accent: '#1B6A9B',
    accentStrong: '#124F78',
    accentText: '#FFFFFF',
    avatar: '#DCEAF4',
    avatarText: '#123B5D',
    notice: '#FFF4D6',
    noticeText: '#5F522C',
    invite: '#E7F1F8',
    inviteText: '#123B5D',
    input: '#FFFFFF',
    disabled: '#8B9AA6',
    danger: '#A43F49',
    reviewGreen: '#E7F3EC',
    reviewYellow: '#FFF3D8',
    reviewRed: '#F8E5E7',
    reviewText: '#1D2A34',
    reviewMuted: '#586875',
  },
  dark: {
    background: '#0B1117',
    surface: '#111A22',
    surfaceSoft: '#17232D',
    text: '#F3F7FA',
    muted: '#BAC6D0',
    subtle: '#97A8B6',
    border: '#2A3A47',
    borderStrong: '#405565',
    brand: '#9FD3F2',
    accent: '#69B6E6',
    accentStrong: '#176996',
    accentText: '#FFFFFF',
    avatar: '#203746',
    avatarText: '#CBE8F7',
    notice: '#332C1B',
    noticeText: '#F3DFA4',
    invite: '#163047',
    inviteText: '#D5ECFA',
    input: '#17232D',
    disabled: '#647582',
    danger: '#E17B84',
    reviewGreen: '#153426',
    reviewYellow: '#3A301B',
    reviewRed: '#3C2025',
    reviewText: '#F3F7FA',
    reviewMuted: '#C7D1D8',
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

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;
const FALLBACK_START = '08:00:00';
const FALLBACK_END = '18:00:00';

export interface NormalizedMessageWindow {
  start: string;
  end: string;
}

export function normalizeLocalTime(value: string) {
  const match = value.trim().match(TIME_PATTERN);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

export function normalizeMessageWindow(enabled: boolean, startValue: string, endValue: string): NormalizedMessageWindow {
  const start = normalizeLocalTime(startValue);
  const end = normalizeLocalTime(endValue);

  if (!enabled) return { start: start ?? FALLBACK_START, end: end ?? FALLBACK_END };
  if (!start || !end) throw new Error('Use 24-hour time such as 08:00 or 17:30.');
  if (start >= end) throw new Error('The opening time must be earlier than the closing time. Overnight windows are not supported.');
  return { start, end };
}

export function normalizeIanaTimezone(value: string) {
  const clean = value.trim();
  if (!clean || clean.length > 100 || /[\u0000-\u001f\u007f]/.test(clean)) return null;
  try {
    return new Intl.DateTimeFormat('en', { timeZone: clean }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function detectedDeviceTimezone() {
  return normalizeIanaTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || '') ?? 'UTC';
}

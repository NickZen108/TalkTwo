import type { PartnerWindow } from '../services/windows';

export interface PartnerAvailability {
  userId: string;
  timezone: string;
  localTime: string;
  differenceMinutes: number;
  configured: boolean;
  start: string | null;
  end: string | null;
  isOpen: boolean;
  closedToday: boolean;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function timezoneParts(now: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const weekday = WEEKDAYS[parts.weekday ?? ''];
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  if (!Number.isInteger(weekday) || !Number.isFinite(hour) || !Number.isFinite(minute)) throw new Error('Invalid timezone');
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const nowRounded = Math.floor(now.getTime() / 60_000) * 60_000;
  const targetOffsetMinutes = Math.round((localAsUtc - nowRounded) / 60_000);
  const deviceOffsetMinutes = -now.getTimezoneOffset();
  return {
    weekday,
    minutes: hour * 60 + minute,
    localTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    differenceMinutes: targetOffsetMinutes - deviceOffsetMinutes,
  };
}

function hhmm(value: string | null) {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function minuteOfDay(value: string | null) {
  const normalized = hhmm(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(':').map(Number);
  return hour * 60 + minute;
}

export function buildPartnerAvailability(rows: PartnerWindow[], now = new Date()): PartnerAvailability[] {
  const byUser = new Map<string, PartnerWindow[]>();
  for (const row of rows) {
    const existing = byUser.get(row.user_id) ?? [];
    existing.push(row);
    byUser.set(row.user_id, existing);
  }

  return Array.from(byUser.entries()).map(([userId, userRows]) => {
    const timezone = userRows[0]?.timezone || 'UTC';
    let local;
    try {
      local = timezoneParts(now, timezone);
    } catch {
      local = timezoneParts(now, 'UTC');
    }
    const configured = userRows.some((row) => row.weekday !== null);
    const today = userRows.find((row) => row.weekday === local.weekday && row.enabled === true) ?? null;
    const startMinutes = minuteOfDay(today?.start_local ?? null);
    const endMinutes = minuteOfDay(today?.end_local ?? null);
    const isOpen = !configured || Boolean(
      today
      && startMinutes !== null
      && endMinutes !== null
      && local.minutes >= startMinutes
      && local.minutes < endMinutes
    );

    return {
      userId,
      timezone,
      localTime: local.localTime,
      differenceMinutes: local.differenceMinutes,
      configured,
      start: hhmm(today?.start_local ?? null),
      end: hhmm(today?.end_local ?? null),
      isOpen,
      closedToday: configured && !today,
    };
  });
}

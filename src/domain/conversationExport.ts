import type { ChatMessage } from '../services/messages';

export interface ExportParticipant {
  id: string;
  name: string;
}

export interface ConversationExportRange {
  startDate?: string;
  endDate?: string;
}

export type ExportRangeError = 'invalid_start' | 'invalid_end' | 'start_after_end';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function printableDate(value: string, locale?: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale);
}

function localDayBoundary(value: string, endOfDay: boolean) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function validateExportDateRange(startDate: string, endDate: string) {
  const start = startDate.trim();
  const end = endDate.trim();
  const startBoundary = start ? localDayBoundary(start, false) : null;
  const endBoundary = end ? localDayBoundary(end, true) : null;
  if (start && !startBoundary) return { valid: false as const, error: 'invalid_start' as ExportRangeError };
  if (end && !endBoundary) return { valid: false as const, error: 'invalid_end' as ExportRangeError };
  if (startBoundary && endBoundary && startBoundary.getTime() > endBoundary.getTime()) {
    return { valid: false as const, error: 'start_after_end' as ExportRangeError };
  }
  return {
    valid: true as const,
    range: {
      startDate: start || undefined,
      endDate: end || undefined,
    } satisfies ConversationExportRange,
  };
}

export function exportableMessages(messages: ChatMessage[], range: ConversationExportRange = {}) {
  const startBoundary = range.startDate ? localDayBoundary(range.startDate, false)?.getTime() : undefined;
  const endBoundary = range.endDate ? localDayBoundary(range.endDate, true)?.getTime() : undefined;
  return messages
    .filter((message) => {
      if (message.message_kind !== 'text' || !message.body || message.withdrawn_at || message.blocked_for_recipient) return false;
      const created = new Date(message.created_at).getTime();
      if (!Number.isFinite(created)) return false;
      if (startBoundary !== undefined && created < startBoundary) return false;
      if (endBoundary !== undefined && created > endBoundary) return false;
      return true;
    })
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function printableRange(range: ConversationExportRange, locale: string, isDanish: boolean) {
  if (!range.startDate && !range.endDate) return isDanish ? 'hele synlige historik' : 'all visible history';
  const format = (value: string) => localDayBoundary(value, false)?.toLocaleDateString(locale) ?? value;
  if (range.startDate && range.endDate) return `${format(range.startDate)} – ${format(range.endDate)}`;
  if (range.startDate) return `${isDanish ? 'fra' : 'from'} ${format(range.startDate)}`;
  return `${isDanish ? 'til' : 'through'} ${format(range.endDate!)}`;
}

export function conversationExportHtml(
  title: string,
  participants: ExportParticipant[],
  messages: ChatMessage[],
  locale = 'en',
  range: ConversationExportRange = {},
) {
  const names = new Map(participants.map((participant) => [participant.id, participant.name]));
  const visible = exportableMessages(messages, range);
  const isDanish = locale.toLowerCase().startsWith('da');
  const createdLabel = isDanish ? 'oprettet' : 'created';
  const intervalLabel = isDanish ? 'interval' : 'range';
  const countLabel = visible.length
    ? `${visible.length} ${isDanish ? 'synlige beskeder' : 'visible messages'}`
    : isDanish ? 'Ingen synlige beskeder' : 'No visible messages';
  const memberFallback = isDanish ? 'TalkTwo-bruger' : 'TalkTwo member';
  const conversationFallback = isDanish ? 'samtalen' : 'conversation';
  const rows = visible.map((message) => {
    const sender = names.get(message.sender_id) ?? memberFallback;
    const recipient = message.recipient_id ? names.get(message.recipient_id) ?? memberFallback : conversationFallback;
    return `<article><div class="meta"><strong>${escapeHtml(sender)} → ${escapeHtml(recipient)}</strong><time>${escapeHtml(printableDate(message.created_at, locale))}</time></div><p>${escapeHtml(message.body ?? '').replaceAll('\n', '<br>')}</p></article>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    @page { margin: 18mm 16mm; }
    body { color:#17231d; font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; line-height:1.45; }
    h1 { font-size:22px; margin:0 0 4px; } .note { color:#52625a; margin:0 0 22px; }
    article { border-top:1px solid #d9e1dc; padding:12px 0; break-inside:avoid; }
    .meta { display:flex; justify-content:space-between; gap:16px; color:#33443b; }
    time { color:#68766f; font-size:12px; white-space:nowrap; } p { margin:6px 0 0; white-space:normal; }
  </style></head><body><h1>${escapeHtml(title)}</h1><p class="note">Private TalkTwo export · ${intervalLabel}: ${escapeHtml(printableRange(range, locale, isDanish))} · ${createdLabel} ${escapeHtml(printableDate(new Date().toISOString(), locale))} · ${countLabel}</p>${rows}</body></html>`;
}

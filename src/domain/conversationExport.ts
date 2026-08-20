import type { ChatMessage } from '../services/messages';

export interface ExportParticipant {
  id: string;
  name: string;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function printableDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function exportableMessages(messages: ChatMessage[]) {
  return messages
    .filter((message) => Boolean(message.body) && !message.withdrawn_at && !message.blocked_for_recipient)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export function conversationExportHtml(title: string, participants: ExportParticipant[], messages: ChatMessage[]) {
  const names = new Map(participants.map((participant) => [participant.id, participant.name]));
  const visible = exportableMessages(messages);
  const rows = visible.map((message) => {
    const sender = names.get(message.sender_id) ?? 'TalkTwo member';
    return `<article><div class="meta"><strong>${escapeHtml(sender)}</strong><time>${escapeHtml(printableDate(message.created_at))}</time></div><p>${escapeHtml(message.body ?? '').replaceAll('\n', '<br>')}</p></article>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    @page { margin: 18mm 16mm; }
    body { color:#17231d; font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; line-height:1.45; }
    h1 { font-size:22px; margin:0 0 4px; } .note { color:#52625a; margin:0 0 22px; }
    article { border-top:1px solid #d9e1dc; padding:12px 0; break-inside:avoid; }
    .meta { display:flex; justify-content:space-between; gap:16px; color:#33443b; }
    time { color:#68766f; font-size:12px; white-space:nowrap; } p { margin:6px 0 0; white-space:normal; }
  </style></head><body><h1>${escapeHtml(title)}</h1><p class="note">Private TalkTwo export · created ${escapeHtml(printableDate(new Date().toISOString()))} · ${visible.length ? `${visible.length} visible messages` : 'No visible messages'}</p>${rows}</body></html>`;
}

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_CHARACTERS = 60_000;
export const MAX_ATTACHMENT_PAGES = 20;
export const ATTACHMENT_PAGE_CHARACTERS = 3_000;
export const MAX_ATTACHMENT_NAME_CHARACTERS = 120;

const allowedExtensions = new Set(['txt', 'md', 'markdown', 'csv']);
const allowedMimeTypes = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

export interface PreparedTextAttachment {
  name: string;
  mimeType: 'text/plain' | 'text/markdown' | 'text/csv';
  sizeBytes: number;
  pageCount: number;
  text: string;
}

export type TextAttachmentValidation =
  | { ok: true; attachment: PreparedTextAttachment }
  | { ok: false; reason: string };

function extension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function safeAttachmentName(input: string) {
  return input
    .normalize('NFKC')
    .replace(/[\\/]/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ATTACHMENT_NAME_CHARACTERS);
}

export function canonicalAttachmentMimeType(name: string): PreparedTextAttachment['mimeType'] | null {
  const ext = extension(name);
  if (ext === 'txt') return 'text/plain';
  if (ext === 'md' || ext === 'markdown') return 'text/markdown';
  if (ext === 'csv') return 'text/csv';
  return null;
}

export function attachmentPageCount(text: string) {
  const characterPages = Math.max(1, Math.ceil(Array.from(text).length / ATTACHMENT_PAGE_CHARACTERS));
  const explicitPages = Math.max(1, text.split('\f').length);
  return Math.max(characterPages, explicitPages);
}

export function normalizeAttachmentText(input: string) {
  return input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .normalize('NFC')
    .trim();
}

export function validateTextAttachment(input: {
  name: string;
  mimeType?: string | null;
  sizeBytes: number;
  text: string;
}): TextAttachmentValidation {
  const name = safeAttachmentName(input.name);
  const ext = extension(name);
  const reportedMime = String(input.mimeType ?? '').toLowerCase().split(';')[0]?.trim() ?? '';
  if (!name || name.length > MAX_ATTACHMENT_NAME_CHARACTERS) {
    return { ok: false, reason: 'The document needs a valid file name.' };
  }
  if (!allowedExtensions.has(ext) || (reportedMime && !allowedMimeTypes.has(reportedMime))) {
    return { ok: false, reason: 'TalkTwo currently accepts only plain-text .txt, .md and .csv documents.' };
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: 'Documents must be between 1 byte and 5 MB.' };
  }

  const text = normalizeAttachmentText(input.text);
  if (!text) return { ok: false, reason: 'The document contains no readable text.' };
  if (/\u0000/.test(text)) return { ok: false, reason: 'The selected file is not a valid plain-text document.' };
  const disallowedControls = Array.from(text).filter((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 32 && char !== '\n' && char !== '\t' && char !== '\f';
  });
  if (disallowedControls.length > 0) {
    return { ok: false, reason: 'The document contains unsupported control characters.' };
  }

  const characters = Array.from(text).length;
  if (characters > MAX_ATTACHMENT_CHARACTERS) {
    return { ok: false, reason: 'The readable document text is longer than the 20-page limit.' };
  }
  const pageCount = attachmentPageCount(text);
  if (pageCount > MAX_ATTACHMENT_PAGES) {
    return { ok: false, reason: 'Documents are limited to 20 logical pages.' };
  }

  const mimeType = canonicalAttachmentMimeType(name);
  if (!mimeType) return { ok: false, reason: 'The document type is not supported.' };
  return { ok: true, attachment: { name, mimeType, sizeBytes: input.sizeBytes, pageCount, text } };
}

export function attachmentSizeLabel(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.ceil(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function attachmentExcerpt(text: string, limit = 220) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(clean);
  return chars.length <= limit ? clean : `${chars.slice(0, limit).join('')}…`;
}

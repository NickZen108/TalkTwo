// TalkTwo deliberately avoids symbolic tone because emoji and emoticons can be
// read as sarcasm, contempt or emotional pressure. Use words instead.
const emojiRegex = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;
const emoticonRegex = /(?:[:;=8xX][-^']?[()DPp/|]|<3|\^_\^|-_-)/u;

export type SymbolicToneKind = 'emoji' | 'emoticon';

export function symbolicToneKind(text: string): SymbolicToneKind | null {
  if (emojiRegex.test(text)) return 'emoji';
  if (emoticonRegex.test(text)) return 'emoticon';
  return null;
}

export function assertNoSymbolicTone(text: string) {
  const kind = symbolicToneKind(text);
  if (!kind) return;
  throw new Error(
    kind === 'emoji'
      ? 'Emoji are not allowed in TalkTwo messages. Use words if you want to express a feeling.'
      : 'Emoticons are not allowed in TalkTwo messages. Use words if you want to express a feeling.',
  );
}

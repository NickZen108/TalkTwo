import { normalizePolicyText } from '../domain/policyText';
import { FilterReason, FilterResult } from './types';

const MAX_FREE_LENGTH = 160;
export const FREE_PROFANITY_LANGUAGES = ['en', 'da'] as const;

// Keep the Free tier deliberately mechanical. These are exact normalized words,
// not an attempt to infer intent or relationship dynamics. Avoid ambiguous words
// that are commonly harmless in practical messages.
const BANNED_WORDS = new Set([
  // English profanity / direct insults
  'fuck', 'fucked', 'fucker', 'fuckers', 'fucking', 'motherfucker', 'motherfuckers',
  'shit', 'bullshit', 'bitch', 'bitches', 'asshole', 'assholes', 'cunt', 'cunts',
  'dickhead', 'dickheads', 'bastard', 'bastards', 'prick', 'pricks', 'wanker',
  'wankers', 'twat', 'twats', 'idiot', 'idiots', 'moron', 'morons',
  // Danish profanity / direct insults
  'fandme', 'fanden', 'satme', 'kraftedeme', 'krafteme', 'lort', 'lorte', 'pis',
  'pisse', 'røvhul', 'røvhuller', 'kælling', 'kællinger', 'idiot', 'idioter',
  'nar', 'narrer', 'svin', 'klaphat', 'klaphatte',
]);

const BANNED_PHRASES = [
  'fuck you',
  'fuck dig',
  'hold kæft',
  'shut up',
];

// Extended pictographs covers most emoji. Regional indicators catch flags, while
// variation selector/keycap catch emoji sequences such as ©️ and 1️⃣. Run this
// against the original text before policy canonicalization removes format marks.
const emojiRegex = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;
const emoticonRegex = /(?:[:;=8xX][\-^']?[()DPp]|<3)/;
const repeatedPunctuationRegex = /([?.;,])\1+/u;
const repeatedLetterRegex = /(\p{L})\1{3,}/iu;
const repeatedWordRegex = /(?:^|[^\p{L}])(\p{L}{2,})(?:[\s,.;:-]+\1){2,}(?=$|[^\p{L}])/iu;
const longUppercaseRunRegex = /\p{Lu}{5,}/u;

function addReason(reasons: FilterReason[], reason: FilterReason) {
  if (!reasons.some((item) => item.code === reason.code && item.matchedText === reason.matchedText)) {
    reasons.push(reason);
  }
}

function words(value: string) {
  return value.toLocaleLowerCase().match(/\p{L}+/gu) ?? [];
}

function hasProfanity(value: string) {
  const lower = value.toLocaleLowerCase();
  if (BANNED_PHRASES.some((phrase) => lower.includes(phrase))) return true;
  return words(lower).some((word) => BANNED_WORDS.has(word));
}

function uppercaseRatio(value: string) {
  const letters = value.match(/\p{L}/gu) ?? [];
  if (letters.length < 10) return 0;
  const uppercase = letters.filter((letter) => letter === letter.toLocaleUpperCase() && letter !== letter.toLocaleLowerCase()).length;
  return uppercase / letters.length;
}

export function countMessageCharacters(message: string) {
  return Array.from(message).length;
}

export function evaluateFreeMessage(message: string): FilterResult {
  const text = message.trim();
  const policyText = normalizePolicyText(text);
  const reasons: FilterReason[] = [];

  if (countMessageCharacters(text) > MAX_FREE_LENGTH) {
    addReason(reasons, {
      code: 'too_long',
      title: 'Message too long',
      explanation: `Free messages can contain up to ${MAX_FREE_LENGTH} characters.`,
      suggestion: 'Keep only the practical information or request.',
    });
  }

  if (policyText.includes('!')) {
    addReason(reasons, {
      code: 'exclamation_mark',
      title: 'Remove the exclamation mark',
      explanation: 'Free messages do not use exclamation marks.',
      suggestion: 'Use a full stop or a neutral question instead.',
      matchedText: '!',
    });
  }

  if (emojiRegex.test(text) || emoticonRegex.test(policyText)) {
    addReason(reasons, {
      code: 'emoji',
      title: 'Remove emoji or emoticon',
      explanation: 'Free messages use plain text only.',
      suggestion: 'Write the practical information directly in words.',
    });
  }

  if (hasProfanity(policyText)) {
    addReason(reasons, {
      code: 'profanity',
      title: 'Remove profanity or direct insults',
      explanation: 'Free messages do not allow obvious profanity or direct insults.',
      suggestion: 'Replace the word with neutral language.',
    });
  }

  const repetition = policyText.match(repeatedPunctuationRegex)
    ?? policyText.match(repeatedLetterRegex)
    ?? policyText.match(repeatedWordRegex);
  if (repetition) {
    addReason(reasons, {
      code: 'repetition',
      title: 'Avoid repetition / Undgå gentagelser',
      explanation: 'Repeated punctuation, stretched words or the same word three times in a row are blocked. / Gentagen tegnsætning, forlængede ord eller samme ord tre gange i træk blokeres.',
      suggestion: 'Write it once in ordinary text. / Skriv det én gang med almindelig tekst.',
      matchedText: repetition[0],
    });
  }

  if (longUppercaseRunRegex.test(policyText) || uppercaseRatio(policyText) > 0.65) {
    addReason(reasons, {
      code: 'caps_lock',
      title: 'Avoid capital letters',
      explanation: 'Long runs of capital letters can read as shouting.',
      suggestion: 'Use ordinary capitalization. Short acronyms such as SMS or CPR are fine.',
    });
  }

  return {
    level: reasons.length === 0 ? 'green' : 'red',
    canSend: reasons.length === 0,
    reasons,
  };
}

export { MAX_FREE_LENGTH };

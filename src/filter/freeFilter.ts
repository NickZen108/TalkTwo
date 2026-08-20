import { FilterReason, FilterResult } from './types';

const MAX_FREE_LENGTH = 160;

const PROFANITY_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'fuck', regex: /(?:^|[^\p{L}])(?:fuck(?:ing|ed|er)?|motherfucker)(?=$|[^\p{L}])/iu },
  { label: 'shit', regex: /(?:^|[^\p{L}])(?:shit|bullshit)(?=$|[^\p{L}])/iu },
  { label: 'bitch', regex: /(?:^|[^\p{L}])bitch(?=$|[^\p{L}])/iu },
  { label: 'asshole', regex: /(?:^|[^\p{L}])asshole(?=$|[^\p{L}])/iu },
  { label: 'cunt', regex: /(?:^|[^\p{L}])cunt(?=$|[^\p{L}])/iu },
  { label: 'dickhead', regex: /(?:^|[^\p{L}])dickhead(?=$|[^\p{L}])/iu },
  { label: 'idiot', regex: /(?:^|[^\p{L}])(?:idiot|moron)(?=$|[^\p{L}])/iu },
  { label: 'fuck dig', regex: /(?:^|[^\p{L}])fuck\s+dig(?=$|[^\p{L}])/iu },
  { label: 'røvhul', regex: /(?:^|[^\p{L}])røvhul(?=$|[^\p{L}])/iu },
  { label: 'kælling', regex: /(?:^|[^\p{L}])kælling(?=$|[^\p{L}])/iu },
  { label: 'fandme', regex: /(?:^|[^\p{L}])fandme(?=$|[^\p{L}])/iu },
  { label: 'hold kæft', regex: /(?:^|[^\p{L}])hold\s+kæft(?=$|[^\p{L}])/iu },
  { label: 'lort', regex: /(?:^|[^\p{L}])lort(?=$|[^\p{L}])/iu },
];

const GENERALISATIONS: Array<{ label: string; regex: RegExp }> = [
  { label: 'always', regex: /(?:^|[^\p{L}])always(?=$|[^\p{L}])/iu },
  { label: 'never', regex: /(?:^|[^\p{L}])never(?=$|[^\p{L}])/iu },
  { label: 'every time', regex: /(?:^|[^\p{L}])every\s+time(?=$|[^\p{L}])/iu },
  { label: 'constantly', regex: /(?:^|[^\p{L}])constantly(?=$|[^\p{L}])/iu },
  { label: 'altid', regex: /(?:^|[^\p{L}])altid(?=$|[^\p{L}])/iu },
  { label: 'aldrig', regex: /(?:^|[^\p{L}])aldrig(?=$|[^\p{L}])/iu },
  { label: 'hver gang', regex: /(?:^|[^\p{L}])hver\s+gang(?=$|[^\p{L}])/iu },
  { label: 'konstant', regex: /(?:^|[^\p{L}])konstant(?=$|[^\p{L}])/iu },
];

const FAULT_REMINDER_PATTERNS = [
  /\b(?:late|forgot|failed|missed|wrong)\b.{0,20}\bagain\b/i,
  /\bagain\b.{0,20}\b(?:late|forgot|failed|missed|wrong)\b/i,
  /\b(?:for sent|forsinket|glemte|glemt|svigtede|forkert)\b.{0,20}\bigen\b/i,
  /\bigen\b.{0,20}\b(?:for sent|forsinket|glemte|glemt|svigtede|forkert)\b/i,
];

const CRITICISM_PATTERNS = [
  /\bwhy can(?:'|’)t you\b/i,
  /\bwhy do you always\b/i,
  /\bdet er ikke okay at du\b/i,
  /\bjeg synes ikke det er okay at du\b/i,
  /\bhvorfor kan du ikke\b/i,
  /\bhvorfor gør du altid\b/i,
  /\byou (?:are|were).{0,40}\b(?:late|wrong|selfish|irresponsible|rude|unreasonable|lazy|careless)\b/i,
  /\bdu (?:er|var|kom).{0,40}\b(?:forsinket|for sent|forkert|egoistisk|uansvarlig|uhøflig|urimelig|doven|ligeglad)\b/i,
];

const EMOTION_PATTERNS = [
  /\bi feel\b/i,
  /\byou make me feel\b/i,
  /\bi am hurt\b/i,
  /\bi'm hurt\b/i,
  /\bjeg føler\b/i,
  /\bjeg bliver ked af\b/i,
  /\bdu gør mig\b/i,
  /\bjeg er såret\b/i,
];

// Extended pictographs covers most emoji. Regional indicators catch flags, while
// variation selector/keycap catch emoji sequences such as ©️ and 1️⃣.
const emojiRegex = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;
const emoticonRegex = /(?:[:;=8xX][\-^']?[()DPp]|<3)/;

function addReason(reasons: FilterReason[], reason: FilterReason) {
  if (!reasons.some((item) => item.code === reason.code && item.matchedText === reason.matchedText)) {
    reasons.push(reason);
  }
}

export function countMessageCharacters(message: string) {
  return Array.from(message).length;
}

export function evaluateFreeMessage(message: string): FilterResult {
  const text = message.trim();
  const reasons: FilterReason[] = [];

  if (countMessageCharacters(text) > MAX_FREE_LENGTH) {
    addReason(reasons, {
      code: 'too_long',
      title: 'Message too long',
      explanation: `Free messages can contain up to ${MAX_FREE_LENGTH} characters. Short messages are easier to keep practical and neutral.`,
      suggestion: 'Remove background, explanations and emotional commentary. Keep only the necessary information or request.',
    });
  }

  if (text.includes('!')) {
    addReason(reasons, {
      code: 'exclamation_mark',
      title: 'Remove the exclamation mark',
      explanation: 'Exclamation marks can make a message feel more forceful or confrontational.',
      suggestion: 'Use a full stop or a neutral question instead.',
      matchedText: '!',
    });
  }

  if (emojiRegex.test(text) || emoticonRegex.test(text)) {
    addReason(reasons, {
      code: 'emoji',
      title: 'Remove emoji or emoticon',
      explanation: 'Free messages use plain text so tone is less likely to be misunderstood.',
      suggestion: 'State the practical information directly in words.',
    });
  }

  for (const { label, regex } of PROFANITY_PATTERNS) {
    if (regex.test(text)) {
      addReason(reasons, {
        code: 'profanity',
        title: 'Remove profanity',
        explanation: 'Profanity can be misunderstood or experienced as hostile, even when intended humorously.',
        suggestion: 'Replace it with neutral language.',
        matchedText: label,
      });
      break;
    }
  }

  for (const { label, regex } of GENERALISATIONS) {
    if (regex.test(text)) {
      addReason(reasons, {
        code: 'generalisation',
        title: 'Remove the generalisation',
        explanation: `“${label}” turns one situation into a broad judgment and can increase conflict.`,
        suggestion: 'Describe only the specific practical situation that matters now.',
        matchedText: label,
      });
    }
  }

  for (const pattern of FAULT_REMINDER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      addReason(reasons, {
        code: 'fault_reminder',
        title: 'Remove the reminder of past faults',
        explanation: 'Words such as “again” or “igen” are blocked when they are used to point out a repeated failure.',
        suggestion: 'State only the practical situation that matters now.',
        matchedText: match[0],
      });
      break;
    }
  }

  for (const pattern of CRITICISM_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      addReason(reasons, {
        code: 'criticism',
        title: 'Remove criticism of the recipient',
        explanation: 'The message comments on the other person rather than only communicating necessary information.',
        suggestion: 'State the fact, request, agreement or practical next step without judging the recipient.',
        matchedText: match[0],
      });
      break;
    }
  }

  for (const pattern of EMOTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      addReason(reasons, {
        code: 'emotion_dumping',
        title: 'Remove the emotional reaction',
        explanation: 'TalkTwo keeps difficult communication focused on necessary information rather than emotional reactions to the recipient.',
        suggestion: 'Keep only what happened, what is needed, or what practical action comes next.',
        matchedText: match[0],
      });
      break;
    }
  }

  const letters = text.replace(/[^A-Za-zÆØÅÄÖÜæøåäöü]/g, '');
  if (letters.length >= 8) {
    const upper = letters.replace(/[^A-ZÆØÅÄÖÜ]/g, '').length;
    if (upper / letters.length > 0.7) {
      addReason(reasons, {
        code: 'caps_lock',
        title: 'Avoid capital letters',
        explanation: 'Mostly capitalized text can read as shouting.',
        suggestion: 'Rewrite the message using normal capitalization.',
      });
    }
  }

  return {
    level: reasons.length === 0 ? 'green' : 'red',
    canSend: reasons.length === 0,
    reasons,
  };
}

export { MAX_FREE_LENGTH };

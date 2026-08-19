import { FilterReason, FilterResult } from './types';

const MAX_FREE_LENGTH = 160;

const PROFANITY = [
  'fuck', 'fucking', 'shit', 'bitch', 'idiot', 'asshole',
  'fuck dig', 'fucking', 'lort', 'idiot', 'røvhul', 'kælling', 'fandme'
];

const GENERALISATIONS = [
  'always', 'never', 'every time', 'constantly',
  'altid', 'aldrig', 'hver gang', 'konstant'
];

const CRITICISM_PATTERNS = [
  /\byou are\b/i,
  /\byou're\b/i,
  /\bwhy can(?:'|’)t you\b/i,
  /\bwhy do you always\b/i,
  /\bdu er\b/i,
  /\bhvorfor kan du ikke\b/i,
  /\bhvorfor gør du altid\b/i,
  /\bdet er ikke okay at du\b/i,
  /\bjeg synes ikke det er okay at du\b/i,
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

const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function addReason(reasons: FilterReason[], reason: FilterReason) {
  if (!reasons.some((item) => item.code === reason.code && item.matchedText === reason.matchedText)) {
    reasons.push(reason);
  }
}

export function evaluateFreeMessage(message: string): FilterResult {
  const text = message.trim();
  const lower = text.toLocaleLowerCase();
  const reasons: FilterReason[] = [];

  if (text.length > MAX_FREE_LENGTH) {
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

  if (emojiRegex.test(text) || /:-?\)|:-?\(|;\-?\)|:\-?D/.test(text)) {
    addReason(reasons, {
      code: 'emoji',
      title: 'Remove emoji or emoticon',
      explanation: 'Free messages use plain text so tone is less likely to be misunderstood.',
      suggestion: 'State the practical information directly in words.',
    });
  }

  for (const word of PROFANITY) {
    if (lower.includes(word)) {
      addReason(reasons, {
        code: 'profanity',
        title: 'Remove profanity',
        explanation: 'Profanity can be misunderstood or experienced as hostile, even when intended humorously.',
        suggestion: 'Replace it with neutral language.',
        matchedText: word,
      });
      break;
    }
  }

  for (const phrase of GENERALISATIONS) {
    if (lower.includes(phrase)) {
      addReason(reasons, {
        code: 'generalisation',
        title: 'Remove the generalisation',
        explanation: `“${phrase}” turns one situation into a broad judgment and can increase conflict.`,
        suggestion: 'Describe only the specific practical situation that matters now.',
        matchedText: phrase,
      });
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

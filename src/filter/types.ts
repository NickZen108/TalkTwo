export type RiskLevel = 'green' | 'yellow' | 'red';

export type FilterReasonCode =
  | 'too_long'
  | 'exclamation_mark'
  | 'emoji'
  | 'profanity'
  | 'generalisation'
  | 'fault_reminder'
  | 'personal_attack'
  | 'accusatory_question'
  | 'emotion_dumping'
  | 'criticism'
  | 'caps_lock';

export interface FilterReason {
  code: FilterReasonCode;
  title: string;
  explanation: string;
  suggestion: string;
  matchedText?: string;
}

export interface FilterResult {
  level: RiskLevel;
  canSend: boolean;
  reasons: FilterReason[];
}

import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import {
  validateTextAttachment,
  type PreparedTextAttachment,
} from '../domain/textAttachments';
import { supabase } from '../lib/supabase';

export interface AttachmentReview {
  level: 'green' | 'yellow' | 'red';
  can_send: boolean;
  reason: string;
  problematic_text: string[];
  usage: { plan: string; analyses_used: number; analyses_remaining: number; trial_ends_at: string | null } | null;
}

export async function pickTextAttachment(): Promise<PreparedTextAttachment | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/plain', 'text/markdown', 'text/csv', 'application/csv', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error('No document was selected.');

  const file = new File(asset.uri);
  const bytes = await file.bytes();
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('TalkTwo currently accepts UTF-8 plain-text documents only.');
  }
  const checked = validateTextAttachment({
    name: asset.name,
    mimeType: asset.mimeType,
    sizeBytes: asset.size ?? file.size ?? 0,
    text,
  });
  if (!checked.ok) throw new Error(checked.reason);
  return checked.attachment;
}

export async function analyzeTextAttachment(relationshipId: string, attachment: PreparedTextAttachment) {
  const { data, error } = await supabase.functions.invoke('analyze-document', {
    body: {
      relationship_id: relationshipId,
      file_name: attachment.name,
      mime_type: attachment.mimeType,
      size_bytes: attachment.sizeBytes,
      page_count: attachment.pageCount,
      text: attachment.text,
    },
  });
  if (error) throw error;
  if (data?.fallback_free) throw new Error('Daily trial limit reached');
  if (data?.error) throw new Error(data.error);
  return data as AttachmentReview;
}

import { supabase } from '../lib/supabase';
import { cacheMessage, listCachedMessages } from './localDb';
import { decryptMessageBody, encryptMessageBody, hashMessageBody } from './messageCrypto';
import type { PreparedTextAttachment } from '../domain/textAttachments';

export interface ChatMessage {
  id: string;
  logical_id: string;
  relationship_id: string;
  sender_id: string;
  recipient_id: string | null;
  body: string | null;
  body_hash: string;
  ciphertext: string | null;
  risk_level: 'green' | 'yellow';
  created_at: string;
  available_at: string;
  opened_at: string | null;
  withdrawn_at: string | null;
  edited_at: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  blocked_for_recipient: boolean;
  recipient_count: number;
  rejected_count: number;
  delivered_count: number;
  message_kind: 'text' | 'text_attachment';
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_size_bytes: number | null;
  attachment_page_count: number | null;
}

interface AttachmentMetadataRow {
  message_key: string;
  message_kind: 'text_attachment';
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_size_bytes: number | null;
  attachment_page_count: number | null;
}

interface SentDeliveryStatusRow {
  logical_id: string;
  recipient_count: number;
  delivered_count: number;
}

async function currentUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Please sign in again.');
  return user.id;
}

async function verifiedBody(message: ChatMessage) {
  if (!message.ciphertext) return message.body;
  const decrypted = await decryptMessageBody(message.relationship_id, message.ciphertext, message.body_hash);
  if (message.body !== null && message.body.trim() !== decrypted) {
    throw new Error('The encrypted message does not match the approved server copy.');
  }
  return decrypted;
}

async function persistVisibleMessage(ownerUserId: string, message: ChatMessage) {
  if (message.blocked_for_recipient || !message.ciphertext) return null;
  const body = await verifiedBody(message);
  if (!body) return null;
  const mine = message.sender_id === ownerUserId;
  await cacheMessage({
    ownerUserId,
    relationshipId: message.relationship_id,
    messageKey: mine ? message.logical_id : message.id,
    logicalId: message.logical_id,
    serverRowId: mine ? null : message.id,
    senderId: message.sender_id,
    recipientId: message.recipient_id,
    body,
    bodyHash: message.body_hash,
    ciphertext: message.ciphertext,
    riskLevel: message.risk_level,
    createdAt: message.created_at,
    editedAt: message.edited_at,
    rejectedAt: message.rejected_at,
    rejectReason: message.reject_reason,
  });
  return body;
}

export async function listMessages(relationshipId: string) {
  const ownerUserId = await currentUserId();
  const { error: deliveryAckError } = await supabase.rpc('ack_available_messages_delivered', { rel_id: relationshipId });
  if (deliveryAckError) throw deliveryAckError;

  const [{ data, error }, cached, metadataResult, deliveryResult] = await Promise.all([
    supabase.rpc('list_relationship_messages', { rel_id: relationshipId }),
    listCachedMessages(ownerUserId, relationshipId),
    supabase.rpc('list_relationship_attachment_metadata', { rel_id: relationshipId }),
    supabase.rpc('list_my_sent_delivery_status', { rel_id: relationshipId }),
  ]);
  if (error) throw error;
  if (metadataResult.error) throw metadataResult.error;
  if (deliveryResult.error) throw deliveryResult.error;
  const metadata = new Map(
    ((metadataResult.data ?? []) as AttachmentMetadataRow[]).map((row) => [row.message_key, row]),
  );
  const deliveryByLogicalId = new Map(
    ((deliveryResult.data ?? []) as SentDeliveryStatusRow[]).map((row) => [row.logical_id, row]),
  );
  const remote: ChatMessage[] = ((data ?? []) as ChatMessage[]).map((row) => {
    const mine = row.sender_id === ownerUserId;
    const attachment = metadata.get(mine ? row.logical_id : row.id);
    const delivery = mine ? deliveryByLogicalId.get(row.logical_id) : null;
    return {
      ...row,
      recipient_count: delivery?.recipient_count ?? row.recipient_count,
      delivered_count: delivery?.delivered_count ?? 0,
      message_kind: attachment?.message_kind ?? ('text' as const),
      attachment_name: attachment?.attachment_name ?? null,
      attachment_mime_type: attachment?.attachment_mime_type ?? null,
      attachment_size_bytes: attachment?.attachment_size_bytes ?? null,
      attachment_page_count: attachment?.attachment_page_count ?? null,
    };
  });
  const localByKey = new Map(cached.map((row) => [row.message_key, row]));

  const hydrated: ChatMessage[] = [];
  for (const row of remote) {
    const mine = row.sender_id === ownerUserId;
    const key = mine ? row.logical_id : row.id;
    const local = localByKey.get(key);

    if (row.blocked_for_recipient) {
      hydrated.push({ ...row, body: null, ciphertext: null });
      continue;
    }

    if (local) {
      hydrated.push({ ...row, body: local.body, ciphertext: local.ciphertext });
      continue;
    }

    if (row.ciphertext && (mine || row.opened_at)) {
      try {
        const body = await persistVisibleMessage(ownerUserId, row);
        if (body) {
          if (mine) await supabase.rpc('ack_sent_message_cached', { message_id: row.logical_id });
          else await supabase.rpc('ack_opened_message_cached', { message_id: row.id });
          hydrated.push({ ...row, body });
          continue;
        }
      } catch {
        // Keep the server row visible without exposing unverifiable ciphertext as plaintext.
      }
    }

    hydrated.push(row);
  }
  return hydrated;
}

export async function sendMessage(relationshipId: string, body: string) {
  const ownerUserId = await currentUserId();
  const clean = body.trim();
  const encryptedBody = await encryptMessageBody(relationshipId, clean);
  const { data, error } = await supabase.rpc('send_message', {
    rel_id: relationshipId,
    message_body: clean,
    encrypted_body: encryptedBody,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as ChatMessage | null;
  if (!row) throw new Error('Message was not created.');
  const expectedHash = await hashMessageBody(clean);
  if (row.body_hash.toLowerCase() !== expectedHash.toLowerCase()) throw new Error('Server message verification failed.');
  const complete: ChatMessage = {
    ...row,
    body: clean,
    ciphertext: encryptedBody,
    delivered_count: 0,
    message_kind: 'text',
    attachment_name: null,
    attachment_mime_type: null,
    attachment_size_bytes: null,
    attachment_page_count: null,
  };
  await persistVisibleMessage(ownerUserId, complete);
  const { error: ackError } = await supabase.rpc('ack_sent_message_cached', { message_id: row.logical_id });
  if (ackError) throw ackError;
  return complete;
}

export async function sendTextAttachment(relationshipId: string, attachment: PreparedTextAttachment) {
  const ownerUserId = await currentUserId();
  const encryptedBody = await encryptMessageBody(relationshipId, attachment.text);
  const { data, error } = await supabase.rpc('send_text_attachment', {
    rel_id: relationshipId,
    attachment_text: attachment.text,
    encrypted_body: encryptedBody,
    file_name: attachment.name,
    mime_type: attachment.mimeType,
    size_bytes: attachment.sizeBytes,
    page_count: attachment.pageCount,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as ChatMessage | null;
  if (!row) throw new Error('The document was not sent.');
  const expectedHash = await hashMessageBody(attachment.text);
  if (row.body_hash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error('Server document verification failed.');
  }
  const complete: ChatMessage = {
    ...row,
    body: attachment.text,
    ciphertext: encryptedBody,
    delivered_count: 0,
    message_kind: 'text_attachment',
    attachment_name: attachment.name,
    attachment_mime_type: attachment.mimeType,
    attachment_size_bytes: attachment.sizeBytes,
    attachment_page_count: attachment.pageCount,
  };
  await persistVisibleMessage(ownerUserId, complete);
  const { error: ackError } = await supabase.rpc('ack_sent_message_cached', { message_id: row.logical_id });
  if (ackError) throw ackError;
  return complete;
}

export async function openMessage(messageId: string) {
  const ownerUserId = await currentUserId();
  const { data, error } = await supabase.rpc('open_message', { message_id: messageId });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as ChatMessage | null;
  if (!row) throw new Error('Message could not be opened.');
  const body = await persistVisibleMessage(ownerUserId, row);
  if (!body) throw new Error('Message could not be stored securely on this device.');
  const { error: ackError } = await supabase.rpc('ack_opened_message_cached', { message_id: row.id });
  if (ackError) throw ackError;
  return { ...row, body, delivered_count: 0 };
}

export async function rejectMessageWithoutOpening(messageId: string) {
  const { data, error } = await supabase.rpc('reject_message_without_opening', { message_id: messageId });
  if (error) throw error;
  return Boolean(data);
}

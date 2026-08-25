import { supabase } from '../lib/supabase';
import { buildTalkTwoLink } from '../domain/appLinks';
import {
  clearKeyRecoveryApproval,
  createKeyRecoveryEnvelope,
  createKeyRecoverySecret,
  installKeyRecoveryEnvelope,
  keyRecoveryApprovalCode,
} from './threadKeys';

export interface KeyRecoveryApproval {
  request_id: string;
  relationship_id: string;
  requester_id: string;
  requester_name: string;
  expires_at: string;
  verification_code: string;
}

export async function createKeyRecoveryRequest(relationshipId: string) {
  const { data, error } = await supabase.rpc('create_key_recovery_request', { rel_id: relationshipId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.request_id || !row?.token) throw new Error('The secure recovery request could not be created.');
  const requestId = String(row.request_id);
  const token = String(row.token);
  try {
    const material = await createKeyRecoverySecret(requestId, token);
    return {
      requestId,
      expiresAt: String(row.expires_at),
      verificationCode: material.verificationCode,
      // The recovery token authorizes another chat member to inspect/fulfill this
      // request, so keep it beside the envelope secret in the URL fragment.
      url: buildTalkTwoLink('recover-key', undefined, { fragment: { token, s: material.secret } }),
    };
  } catch (error) {
    try {
      await supabase.rpc('cancel_key_recovery_request', { recovery_id: requestId });
    } catch {
      // The request expires automatically; failure to cancel must not hide the local storage error.
    }
    throw error;
  }
}

export async function getKeyRecoveryApproval(token: string) {
  const clean = token.trim();
  const { data, error } = await supabase.rpc('get_key_recovery_request_for_approval', { recovery_token: clean });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('This recovery request is invalid, expired or not for one of your chats.');
  return {
    ...row,
    verification_code: await keyRecoveryApprovalCode(clean),
  } as KeyRecoveryApproval;
}

export async function fulfillKeyRecoveryRequest(token: string, relationshipId: string) {
  const clean = token.trim();
  const envelope = await createKeyRecoveryEnvelope(clean, relationshipId);
  const { data, error } = await supabase.rpc('fulfill_key_recovery_request', {
    recovery_token: clean,
    recovery_envelope: envelope,
  });
  if (error) throw error;
  if (!data) throw new Error('The recovery response could not be stored.');
  await clearKeyRecoveryApproval(clean);
}

export async function installFulfilledKeyRecoveries() {
  const { data, error } = await supabase.rpc('list_my_key_recovery_requests');
  if (error) throw error;
  let installed = 0;
  for (const item of data ?? []) {
    if (item.status !== 'fulfilled' || !item.key_envelope) continue;
    const ok = await installKeyRecoveryEnvelope(
      String(item.request_id),
      String(item.token),
      String(item.relationship_id),
      String(item.key_envelope),
    );
    if (!ok) continue;
    const { data: completed, error: completeError } = await supabase.rpc('complete_key_recovery_request', {
      recovery_id: String(item.request_id),
    });
    if (completeError) throw completeError;
    if (completed) installed += 1;
  }
  return installed;
}

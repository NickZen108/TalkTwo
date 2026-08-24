import { supabase } from '../lib/supabase';
import { ACCOUNT_DELETE_CONFIRMATION } from '../domain/accountDeletion';
import { clearLocalAccountData } from './localDb';
import { clearPendingStorePurchase } from './storeBilling';
import { clearAllTalkTwoThreadSecrets, clearPendingThreadSecrets, removeThreadKeys } from './threadKeys';
import { disablePushNotifications } from './pushNotifications';

export const AUTH_REDIRECT_URL = 'talktwo://auth';

export async function sendMagicLink(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: AUTH_REDIRECT_URL,
    },
  });
  if (error) throw error;
  return normalizedEmail;
}

export async function createSessionFromMagicLink(url: string) {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const raw = hashIndex >= 0 ? url.slice(hashIndex + 1) : queryIndex >= 0 ? url.slice(queryIndex + 1) : '';
  const params = new URLSearchParams(raw);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const errorDescription = params.get('error_description');

  if (errorDescription) throw new Error(decodeURIComponent(errorDescription));
  if (!accessToken || !refreshToken) return null;

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  await disablePushNotifications().catch(() => undefined);
  // Invite and recovery secrets are single-purpose state for the active account.
  // Do not let them silently cross an account switch on a shared device.
  await clearPendingThreadSecrets().catch(() => undefined);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function deleteAccount(userId: string, relationshipIds: string[]) {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: { confirmation: ACCOUNT_DELETE_CONFIRMATION },
  });
  if (error) throw error;
  if (data?.deleted !== true) throw new Error('TalkTwo could not confirm that the account was deleted.');

  let cleanupError: unknown = null;
  try {
    await Promise.all([
      clearLocalAccountData(userId),
      clearPendingStorePurchase(),
    ]);
    // Known IDs remove thread keys created by older, pre-index builds. The index
    // then clears every current TalkTwo thread/invite/recovery secret on device.
    await removeThreadKeys(relationshipIds);
    await clearAllTalkTwoThreadSecrets();
  } catch (error) {
    cleanupError = error;
  } finally {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }

  if (cleanupError) {
    throw new Error('The account was deleted, but some private data could not be removed from this device. Remove TalkTwo from the device before another person uses it.');
  }
}

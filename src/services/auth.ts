import { supabase } from '../lib/supabase';
import { ACCOUNT_DELETE_CONFIRMATION } from '../domain/accountDeletion';
import { clearLocalAccountData } from './localDb';
import { clearPendingStorePurchase } from './storeBilling';
import { removeThreadKeys } from './threadKeys';

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
      removeThreadKeys(relationshipIds),
      clearPendingStorePurchase(),
    ]);
  } catch (error) {
    cleanupError = error;
  } finally {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }

  if (cleanupError) {
    throw new Error('The account was deleted, but some private data could not be removed from this device. Remove TalkTwo from the device before another person uses it.');
  }
}

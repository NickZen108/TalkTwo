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
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('The sign-in link is malformed. Please request a new link.');
  }
  if (parsed.protocol !== 'talktwo:' || parsed.hostname.toLowerCase() !== 'auth') {
    throw new Error('The sign-in link is not a TalkTwo authentication callback.');
  }

  const fragment = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash);
  const errorDescription = parsed.searchParams.get('error_description') ?? fragment.get('error_description');
  if (errorDescription) throw new Error(errorDescription);

  // Never import access or refresh credentials directly from a custom-scheme URL.
  // Mobile authentication uses PKCE, so an intercepted redirect contains only a
  // short-lived one-time code whose verifier remains in device-protected storage.
  if (fragment.has('access_token') || fragment.has('refresh_token')
      || parsed.searchParams.has('access_token') || parsed.searchParams.has('refresh_token')) {
    throw new Error('This sign-in link uses an unsupported legacy authentication flow. Please request a new link.');
  }

  const codes = parsed.searchParams.getAll('code').filter(Boolean);
  if (codes.length !== 1) return null;
  const code = codes[0];
  if (!code || code.length > 2048 || /[\u0000-\u001f\u007f]/.test(code)) {
    throw new Error('The sign-in code is invalid. Please request a new link.');
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
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

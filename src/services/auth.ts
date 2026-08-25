import { supabase } from '../lib/supabase';
import { ACCOUNT_DELETE_CONFIRMATION } from '../domain/accountDeletion';
import { buildTalkTwoLink, parseTalkTwoLink } from '../domain/appLinks';
import { clearLocalAccountData, clearLocalOwnerData } from './localDb';
import { clearPendingStorePurchase } from './storeBilling';
import { clearAllTalkTwoThreadSecrets, removeThreadKeys } from './threadKeys';
import { disablePushNotifications } from './pushNotifications';

export const AUTH_REDIRECT_URL = buildTalkTwoLink('auth');

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
  const parsed = parseTalkTwoLink(url);
  if (!parsed || parsed.family !== 'auth' || parsed.pathSegments.length !== 1) {
    throw new Error('The sign-in link is not a TalkTwo authentication callback.');
  }

  const errorDescription = parsed.query.get('error_description') ?? parsed.fragment.get('error_description');
  if (errorDescription) throw new Error(errorDescription);

  // Never import access or refresh credentials directly from a URL. Mobile
  // authentication uses PKCE, so the callback contains only a short-lived
  // one-time code whose verifier remains in device-protected storage.
  if (parsed.fragment.has('access_token') || parsed.fragment.has('refresh_token')
      || parsed.query.has('access_token') || parsed.query.has('refresh_token')) {
    throw new Error('This sign-in link uses an unsupported legacy authentication flow. Please request a new link.');
  }

  const codes = parsed.query.getAll('code').filter(Boolean);
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
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user.id ?? null;

  await disablePushNotifications().catch(() => undefined);

  let cleanupError: unknown = null;
  try {
    await clearPendingStorePurchase();
    if (userId) await clearLocalOwnerData(userId);
    // Thread/invite/recovery keys are not account-namespaced in SecureStore. An
    // explicit account switch therefore clears the whole TalkTwo secret index so
    // no previous-account conversation key survives into the next login.
    await clearAllTalkTwoThreadSecrets();
  } catch (error) {
    cleanupError = error;
  }

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  if (cleanupError) {
    throw new Error('You were signed out, but some private data could not be removed from this device. Remove TalkTwo before another person uses this device.');
  }
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

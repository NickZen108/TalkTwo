import { AppState, Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { secureAuthStorage } from './secureAuthStorage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
const UI_PREVIEW =
  process.env.EXPO_PUBLIC_UI_PREVIEW === '1' || process.env.EXPO_PUBLIC_UI_PREVIEW === 'true';

function validSupabaseUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validPublishableKey(value: string) {
  return /^sb_publishable_[A-Za-z0-9_-]+$/.test(value);
}

const configOk = validSupabaseUrl(SUPABASE_URL) && validPublishableKey(SUPABASE_PUBLISHABLE_KEY);

/** True when the binary is a frontend-only shell (no live backend). */
export const isUiPreviewMode = UI_PREVIEW && !configOk;

if (!configOk && !UI_PREVIEW) {
  throw new Error('TalkTwo Supabase client configuration is missing or unsafe.');
}

function createUiPreviewClient() {
  const emptySession = { data: { session: null }, error: null };
  const noBackend = () =>
    Promise.resolve({
      data: { session: null, user: null },
      error: { message: 'UI preview only — backend is not connected in this build.' },
    });

  return {
    auth: {
      getSession: async () => emptySession,
      onAuthStateChange: (_callback: unknown) => ({
        data: { subscription: { unsubscribe() {} } },
      }),
      startAutoRefresh() {},
      stopAutoRefresh() {},
      signInWithOtp: noBackend,
      exchangeCodeForSession: noBackend,
      signOut: async () => ({ error: null }),
    },
    functions: {
      invoke: async () => ({
        data: null,
        error: { message: 'UI preview only — backend is not connected in this build.' },
      }),
    },
  } as ReturnType<typeof createClient>;
}

export const supabase = configOk
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        ...(Platform.OS !== 'web' ? { storage: secureAuthStorage } : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        lock: processLock,
      },
    })
  : createUiPreviewClient();

if (configOk && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

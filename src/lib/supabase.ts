import { AppState, Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { secureAuthStorage } from './secureAuthStorage';

const SUPABASE_URL = 'https://gqiyzactnxjhbxzvbgui.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_A6NFp5FAPWwZ1W_hv1qDfg_A5Pk036O';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: secureAuthStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

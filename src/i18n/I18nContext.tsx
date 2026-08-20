import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useLocales } from 'expo-localization';
import { supabase } from '../lib/supabase';
import { resolveSupportedLocale, translate, type SupportedLocale, type TranslationKey } from './translations';

export type { SupportedLocale } from './translations';
export type LocalePreference = 'system' | SupportedLocale;
const LOCALE_KEY = 'talktwo.localePreference.v1';

interface I18nValue {
  locale: SupportedLocale;
  systemLocale: SupportedLocale;
  preference: LocalePreference;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  setPreference: (preference: LocalePreference) => Promise<void>;
  syncAccountPreference: () => Promise<void>;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locales = useLocales();
  const [preference, setPreferenceState] = useState<LocalePreference>('system');
  const systemLocale = resolveSupportedLocale(locales[0]?.languageCode);
  const locale = preference === 'system' ? systemLocale : preference;

  useEffect(() => {
    void SecureStore.getItemAsync(LOCALE_KEY).then((saved) => {
      if (saved === 'system' || saved === 'en' || saved === 'da') setPreferenceState(saved);
    }).catch(() => undefined);
  }, []);

  const value = useMemo<I18nValue>(() => ({
    locale,
    systemLocale,
    preference,
    t: (key, values) => translate(locale, key, values),
    setPreference: async (next) => {
      setPreferenceState(next);
      await SecureStore.setItemAsync(LOCALE_KEY, next, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    },
    syncAccountPreference: async () => {
      const { data, error } = await supabase.rpc('get_my_locale_preference');
      if (error) throw error;
      if (data === 'system' || data === 'en' || data === 'da') {
        setPreferenceState(data);
        await SecureStore.setItemAsync(LOCALE_KEY, data, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
        if (data === 'system') {
          const { error: updateError } = await supabase.rpc('set_my_locale_preference', {
            locale_preference: 'system',
            resolved_locale: systemLocale,
          });
          if (updateError) throw updateError;
        }
      }
    },
  }), [locale, preference, systemLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

export async function saveAccountLocalePreference(preference: LocalePreference, resolvedLocale: SupportedLocale) {
  const { error } = await supabase.rpc('set_my_locale_preference', {
    locale_preference: preference,
    resolved_locale: resolvedLocale,
  });
  if (error) throw error;
}

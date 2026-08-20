import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { APP_PALETTES, type AppColors, type ResolvedAppearance } from '../domain/appPalette';

const APPEARANCE_KEY = 'talktwo.appearance.v1';

export type AppearanceMode = 'system' | 'light' | 'dark';
export type { AppColors, ResolvedAppearance } from '../domain/appPalette';

interface AppThemeValue {
  mode: AppearanceMode;
  resolved: ResolvedAppearance;
  colors: AppColors;
  setMode: (mode: AppearanceMode) => Promise<void>;
}

const ThemeContext = createContext<AppThemeValue | null>(null);

function validMode(value: string | null): value is AppearanceMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<AppearanceMode>('system');

  useEffect(() => {
    void SecureStore.getItemAsync(APPEARANCE_KEY).then((saved) => {
      if (validMode(saved)) setModeState(saved);
    }).catch(() => undefined);
  }, []);

  const resolved: ResolvedAppearance = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const value = useMemo<AppThemeValue>(() => ({
    mode,
    resolved,
    colors: APP_PALETTES[resolved],
    setMode: async (next) => {
      setModeState(next);
      await SecureStore.setItemAsync(APPEARANCE_KEY, next);
    },
  }), [mode, resolved]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside AppThemeProvider');
  return value;
}

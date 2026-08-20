import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, SafeAreaView, StyleSheet, Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { createSessionFromMagicLink } from './src/services/auth';
import { claimPremiumGift, listMyPendingPremiumGifts } from './src/services/premiumGifts';
import { storePendingInviteSecret } from './src/services/threadKeys';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import { AppThemeProvider, useAppTheme } from './src/theme/AppTheme';

const PENDING_INVITE_KEY = 'talktwo.pendingInvite.v4';
const PENDING_GIFT_KEY = 'talktwo.pendingPremiumGift.v1';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export interface PendingInvite {
  kind: 'invite' | 'member';
  token: string;
}

interface PendingPremiumGift {
  giftId: string;
  token: string;
}

function invitationFromUrl(url: string): (PendingInvite & { secret: string }) | null {
  const match = url.match(/^talktwo:\/\/(invite|member)\/([^?#]+)(?:\?[^#]*)?(?:#(.*))?$/i);
  if (!match?.[1] || !match[2]) return null;
  const fragment = match[3] ?? '';
  const secretMatch = fragment.match(/(?:^|&)s=([0-9a-f]{64})(?:&|$)/i);
  if (!secretMatch?.[1]) return null;
  return {
    kind: match[1].toLowerCase() === 'member' ? 'member' : 'invite',
    token: decodeURIComponent(match[2]),
    secret: secretMatch[1].toLowerCase(),
  };
}

function premiumGiftFromUrl(url: string): PendingPremiumGift | null {
  const match = url.match(/^talktwo:\/\/premium-gift\/([^?#]+)\?([^#]+)$/i);
  if (!match?.[1] || !match[2]) return null;
  const params = new URLSearchParams(match[2]);
  const token = params.get('token');
  if (!token) return null;
  return { giftId: decodeURIComponent(match[1]), token };
}

function parseStoredInvite(value: string | null): PendingInvite | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PendingInvite>;
    if ((parsed.kind === 'invite' || parsed.kind === 'member') && typeof parsed.token === 'string' && parsed.token) {
      return { kind: parsed.kind, token: parsed.token };
    }
  } catch {
    // Damaged secure state is ignored rather than copied to less-protected storage.
  }
  return null;
}

function parseStoredGift(value: string | null): PendingPremiumGift | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PendingPremiumGift>;
    if (typeof parsed.giftId === 'string' && parsed.giftId && typeof parsed.token === 'string' && parsed.token) {
      return { giftId: parsed.giftId, token: parsed.token };
    }
  } catch {
    // Damaged secure state is ignored.
  }
  return null;
}

function AppContent() {
  const { colors } = useAppTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [pendingGift, setPendingGift] = useState<PendingPremiumGift | null>(null);
  const [giftPrompted, setGiftPrompted] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function savePendingInvite(invite: PendingInvite) {
      await SecureStore.setItemAsync(PENDING_INVITE_KEY, JSON.stringify(invite), secureOptions);
      if (mounted) setPendingInvite(invite);
    }

    async function savePendingGift(gift: PendingPremiumGift) {
      await SecureStore.setItemAsync(PENDING_GIFT_KEY, JSON.stringify(gift), secureOptions);
      if (mounted) setPendingGift(gift);
    }

    async function handleUrl(url: string | null) {
      if (!url) return;
      const gift = premiumGiftFromUrl(url);
      if (gift) {
        await savePendingGift(gift);
        return;
      }
      const invite = invitationFromUrl(url);
      if (invite) {
        try {
          await storePendingInviteSecret(invite.token, invite.secret);
          await savePendingInvite({ kind: invite.kind, token: invite.token });
        } catch (error) {
          Alert.alert('Invitation could not be stored securely', error instanceof Error ? error.message : 'Ask for a new invitation.');
        }
        return;
      }
      if (/^talktwo:\/\/(invite|member)\//i.test(url)) {
        Alert.alert('Invitation is incomplete', 'This link is missing its one-time encryption secret. Ask the sender for a new invitation.');
        return;
      }
      if (url.toLowerCase().startsWith('talktwo://auth')) {
        try {
          await createSessionFromMagicLink(url);
        } catch (error) {
          Alert.alert('Sign-in link could not be used', error instanceof Error ? error.message : 'Please request a new link.');
        }
      }
    }

    void (async () => {
      const [{ data }, storedInvite, storedGift, initialUrl] = await Promise.all([
        supabase.auth.getSession(),
        SecureStore.getItemAsync(PENDING_INVITE_KEY, secureOptions).catch(() => null),
        SecureStore.getItemAsync(PENDING_GIFT_KEY, secureOptions).catch(() => null),
        Linking.getInitialURL(),
      ]);
      if (!mounted) return;
      setSession(data.session);
      const parsed = parseStoredInvite(storedInvite);
      if (parsed) setPendingInvite(parsed);
      const parsedGift = parseStoredGift(storedGift);
      if (parsedGift) setPendingGift(parsedGift);
      await handleUrl(initialUrl);
      if (mounted) setLoading(false);
    })();

    const linking = Linking.addEventListener('url', ({ url }) => { void handleUrl(url); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));

    return () => {
      mounted = false;
      linking.remove();
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || giftPrompted) return;
    let cancelled = false;

    void (async () => {
      try {
        if (pendingGift) {
          setGiftPrompted(true);
          Alert.alert('Premium gift', 'A Premium gift is ready for this account.', [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Activate',
              onPress: () => {
                void claimPremiumGift(pendingGift.giftId, pendingGift.token)
                  .then(() => SecureStore.deleteItemAsync(PENDING_GIFT_KEY, secureOptions))
                  .then(() => {
                    setPendingGift(null);
                    Alert.alert('Premium activated', 'The gift has been added to this account.');
                  })
                  .catch((error) => Alert.alert('Gift could not be activated', error instanceof Error ? error.message : 'Please try again.'));
              },
            },
          ]);
          return;
        }

        const gifts = await listMyPendingPremiumGifts();
        if (cancelled || gifts.length === 0) return;
        const gift = gifts[0];
        setGiftPrompted(true);
        Alert.alert('Premium gift waiting', 'A paid Premium gift was found for your signed-in email. You do not need the original link.', [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Activate',
            onPress: () => {
              void claimPremiumGift(gift.gift_id)
                .then(() => Alert.alert('Premium activated', 'The gift has been added to this account.'))
                .catch((error) => Alert.alert('Gift could not be activated', error instanceof Error ? error.message : 'Please try again.'));
            },
          },
        ]);
      } catch {
        // Gift discovery must never block sign-in or the main app.
      }
    })();

    return () => { cancelled = true; };
  }, [session, pendingGift, giftPrompted]);

  function clearPendingInvite() {
    setPendingInvite(null);
    void SecureStore.deleteItemAsync(PENDING_INVITE_KEY, secureOptions).catch(() => undefined);
  }

  if (loading) {
    return <SafeAreaView style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /><Text style={[styles.note, { color: colors.muted }]}>Opening TalkTwo…</Text></SafeAreaView>;
  }

  return session
    ? <HomeScreen session={session} pendingInvite={pendingInvite} clearPendingInvite={clearPendingInvite} />
    : <LoginScreen />;
}

export default function App() {
  return <AppThemeProvider><AppContent /></AppThemeProvider>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  note: {},
});

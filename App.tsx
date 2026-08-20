import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, SafeAreaView, StyleSheet, Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import {
  invitationFromUrl,
  isAuthCallbackUrl,
  isInvitationUrl,
  isKeyRecoveryUrl,
  isPremiumGiftUrl,
  keyRecoveryFromUrl,
  premiumGiftFromUrl,
  type PendingInvite,
  type PendingKeyRecoveryApproval,
  type PendingPremiumGift,
} from './src/domain/deepLinks';
import { createSessionFromMagicLink } from './src/services/auth';
import { claimPremiumGift, listMyPendingPremiumGifts } from './src/services/premiumGifts';
import { storePendingInviteSecret, storePendingKeyRecoveryApproval } from './src/services/threadKeys';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import { AppThemeProvider, useAppTheme } from './src/theme/AppTheme';

const PENDING_INVITE_KEY = 'talktwo.pendingInvite.v4';
const PENDING_GIFT_KEY = 'talktwo.pendingPremiumGift.v1';
const PENDING_RECOVERY_KEY = 'talktwo.pendingKeyRecoveryApproval.v1';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

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

function parseStoredRecovery(value: string | null): PendingKeyRecoveryApproval | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PendingKeyRecoveryApproval>;
    if (typeof parsed.token === 'string' && parsed.token) return { token: parsed.token };
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
  const [pendingRecovery, setPendingRecovery] = useState<PendingKeyRecoveryApproval | null>(null);
  const [giftPromptedForUserId, setGiftPromptedForUserId] = useState<string | null>(null);

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

    async function savePendingRecovery(recovery: PendingKeyRecoveryApproval) {
      await SecureStore.setItemAsync(PENDING_RECOVERY_KEY, JSON.stringify(recovery), secureOptions);
      if (mounted) setPendingRecovery(recovery);
    }

    async function handleUrl(url: string | null) {
      if (!url) return;
      const recovery = keyRecoveryFromUrl(url);
      if (recovery) {
        try {
          await storePendingKeyRecoveryApproval(recovery.token, recovery.secret);
          await savePendingRecovery({ token: recovery.token });
        } catch (error) {
          Alert.alert('Recovery request could not be stored securely', error instanceof Error ? error.message : 'Ask for a new recovery link.');
        }
        return;
      }
      const gift = premiumGiftFromUrl(url);
      if (gift) {
        try {
          await savePendingGift(gift);
        } catch (error) {
          Alert.alert('Premium gift could not be stored securely', error instanceof Error ? error.message : 'Please open the link again.');
        }
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
      if (isInvitationUrl(url)) {
        Alert.alert('Invitation is incomplete', 'This link is missing its one-time encryption secret. Ask the sender for a new invitation.');
        return;
      }
      if (isPremiumGiftUrl(url)) {
        Alert.alert('Premium gift link is incomplete', 'Ask the purchaser to share a new gift link. A damaged or ambiguous link is never accepted.');
        return;
      }
      if (isKeyRecoveryUrl(url)) {
        Alert.alert('Recovery link is incomplete', 'Ask the requester to create and share a new secure recovery link.');
        return;
      }
      if (isAuthCallbackUrl(url)) {
        try {
          await createSessionFromMagicLink(url);
        } catch (error) {
          Alert.alert('Sign-in link could not be used', error instanceof Error ? error.message : 'Please request a new link.');
        }
      }
    }

    void (async () => {
      try {
        const [{ data }, storedInvite, storedGift, storedRecovery, initialUrl] = await Promise.all([
          supabase.auth.getSession(),
          SecureStore.getItemAsync(PENDING_INVITE_KEY, secureOptions).catch(() => null),
          SecureStore.getItemAsync(PENDING_GIFT_KEY, secureOptions).catch(() => null),
          SecureStore.getItemAsync(PENDING_RECOVERY_KEY, secureOptions).catch(() => null),
          Linking.getInitialURL(),
        ]);
        if (!mounted) return;
        setSession(data.session);
        const parsed = parseStoredInvite(storedInvite);
        if (parsed) setPendingInvite(parsed);
        const parsedGift = parseStoredGift(storedGift);
        if (parsedGift) setPendingGift(parsedGift);
        const parsedRecovery = parseStoredRecovery(storedRecovery);
        if (parsedRecovery) setPendingRecovery(parsedRecovery);
        await handleUrl(initialUrl);
      } catch {
        if (mounted) Alert.alert('TalkTwo could not finish opening', 'Check your connection, then reopen the app.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const linking = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url).catch(() => Alert.alert('Link could not be opened', 'Please try opening the TalkTwo link again.'));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));

    return () => {
      mounted = false;
      linking.remove();
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || giftPromptedForUserId === session.user.id) return;
    let cancelled = false;

    void (async () => {
      try {
        if (pendingGift) {
          setGiftPromptedForUserId(session.user.id);
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
        const gift = gifts[0];
        if (cancelled || !gift) return;
        setGiftPromptedForUserId(session.user.id);
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
  }, [session, pendingGift, giftPromptedForUserId]);

  function clearPendingInvite() {
    setPendingInvite(null);
    void SecureStore.deleteItemAsync(PENDING_INVITE_KEY, secureOptions).catch(() => undefined);
  }

  function clearPendingRecovery() {
    setPendingRecovery(null);
    void SecureStore.deleteItemAsync(PENDING_RECOVERY_KEY, secureOptions).catch(() => undefined);
  }

  if (loading) {
    return <SafeAreaView style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /><Text style={[styles.note, { color: colors.muted }]}>Opening TalkTwo…</Text></SafeAreaView>;
  }

  return session
    ? <HomeScreen session={session} pendingInvite={pendingInvite} clearPendingInvite={clearPendingInvite} pendingRecovery={pendingRecovery} clearPendingRecovery={clearPendingRecovery} />
    : <LoginScreen />;
}

export default function App() {
  return <AppThemeProvider><AppContent /></AppThemeProvider>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  note: {},
});

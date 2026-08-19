import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, SafeAreaView, StyleSheet, Text } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { createSessionFromMagicLink } from './src/services/auth';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';

function invitationTokenFromUrl(url: string) {
  const match = url.match(/^talktwo:\/\/invite\/([^?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);

  useEffect(() => {
    async function handleUrl(url: string | null) {
      if (!url) return;
      const inviteToken = invitationTokenFromUrl(url);
      if (inviteToken) {
        setPendingInvite(inviteToken);
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

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    void Linking.getInitialURL().then(handleUrl);
    const linking = Linking.addEventListener('url', ({ url }) => { void handleUrl(url); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));

    return () => {
      linking.remove();
      listener.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator /><Text style={styles.note}>Opening TalkTwo…</Text></SafeAreaView>;
  }

  return session
    ? <HomeScreen session={session} pendingInvite={pendingInvite} clearPendingInvite={() => setPendingInvite(null)} />
    : <LoginScreen />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F5F5F2' },
  note: { color: '#666' },
});

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { evaluateFreeMessage, MAX_FREE_LENGTH } from './src/filter/freeFilter';
import { supabase } from './src/lib/supabase';
import { sendLoginCode, signOut, verifyLoginCode } from './src/services/auth';
import {
  acceptInvitation,
  createInvitation,
  listRelationships,
  type RelationshipSummary,
} from './src/services/relationships';

function Button({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text>
    </TouchableOpacity>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function requestCode() {
    try {
      setBusy(true);
      const normalized = await sendLoginCode(email);
      setSentEmail(normalized);
    } catch (error) {
      Alert.alert('Could not send login email', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode() {
    try {
      setBusy(true);
      await verifyLoginCode(sentEmail, code);
    } catch (error) {
      Alert.alert('Code not accepted', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.brand}>TalkTwo</Text>
          <Text style={styles.tagline}>A calmer place for difficult conversations.</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.statusTitle}>Sign in</Text>
          <Text style={styles.statusText}>No password. We send a one-time login code to your email.</Text>
          {!sentEmail ? (
            <>
              <Text style={styles.label}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                style={styles.singleInput}
              />
              <Button title={busy ? 'Sending…' : 'Send login code'} onPress={requestCode} disabled={busy || !email.includes('@')} />
            </>
          ) : (
            <>
              <Text style={styles.smallNote}>Sent to {sentEmail}</Text>
              <Text style={styles.label}>Login code</Text>
              <TextInput
                keyboardType="number-pad"
                value={code}
                onChangeText={setCode}
                placeholder="6-digit code"
                style={styles.singleInput}
              />
              <Button title={busy ? 'Checking…' : 'Continue'} onPress={confirmCode} disabled={busy || code.trim().length < 6} />
              <Button title="Use another email" onPress={() => { setSentEmail(''); setCode(''); }} secondary />
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HomeScreen({ session }: { session: Session }) {
  const [message, setMessage] = useState('');
  const [relationships, setRelationships] = useState<RelationshipSummary[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const result = useMemo(() => evaluateFreeMessage(message), [message]);
  const hasText = message.trim().length > 0;

  async function refreshRelationships() {
    try {
      setRelationships(await listRelationships());
    } catch (error) {
      Alert.alert('Could not load connections', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  useEffect(() => { void refreshRelationships(); }, []);

  async function makeInvite() {
    try {
      setBusy(true);
      const invite = await createInvitation();
      const deepLink = `talktwo://invite/${invite.token}`;
      await Share.share({
        message: `I have invited you to TalkTwo. Open this link after installing TalkTwo: ${deepLink}\n\nInvitation code: ${invite.token}`,
      });
      await refreshRelationships();
    } catch (error) {
      Alert.alert('Could not create invitation', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function joinWithCode() {
    try {
      setBusy(true);
      await acceptInvitation(inviteCode);
      setInviteCode('');
      await refreshRelationships();
      Alert.alert('Connected', 'This TalkTwo connection is now active.');
    } catch (error) {
      Alert.alert('Invitation not accepted', error instanceof Error ? error.message : 'Check the code and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>TalkTwo</Text>
            <Text style={styles.tagline}>{session.user.email}</Text>
          </View>
          <TouchableOpacity onPress={() => void signOut()}><Text style={styles.signOut}>Sign out</Text></TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.statusTitle}>Connections</Text>
          <Text style={styles.statusText}>Both people need TalkTwo. Invite someone, or enter the invitation code they sent you.</Text>
          <Text style={styles.connectionCount}>{relationships.length} connection{relationships.length === 1 ? '' : 's'}</Text>
          <Button title={busy ? 'Please wait…' : 'Invite someone'} onPress={makeInvite} disabled={busy} />
          <Text style={styles.label}>Invitation code</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            value={inviteCode}
            onChangeText={setInviteCode}
            placeholder="Paste code"
            style={styles.singleInput}
          />
          <Button title="Accept invitation" onPress={joinWithCode} disabled={busy || inviteCode.trim().length < 12} secondary />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Free message filter</Text>
          <TextInput
            multiline
            value={message}
            onChangeText={setMessage}
            placeholder="Write a short practical message…"
            style={styles.input}
            maxLength={500}
          />
          <View style={styles.row}>
            <Text style={[styles.counter, message.length > MAX_FREE_LENGTH && styles.counterDanger]}>{message.length}/{MAX_FREE_LENGTH}</Text>
            <Text style={styles.plan}>FREE</Text>
          </View>
        </View>

        {hasText && (
          <View style={[styles.card, result.canSend ? styles.approved : styles.blocked]}>
            <Text style={styles.statusTitle}>{result.canSend ? 'Ready to send' : 'Message blocked'}</Text>
            <Text style={styles.statusText}>{result.canSend ? 'This message passes the current free communication rules.' : 'Please change the points below before sending.'}</Text>
            {result.reasons.map((reason, index) => (
              <View key={`${reason.code}-${index}`} style={styles.reason}>
                <Text style={styles.reasonTitle}>{reason.title}</Text>
                <Text style={styles.reasonText}>{reason.explanation}</Text>
                <Text style={styles.suggestion}>{reason.suggestion}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.premiumCard}>
          <Text style={styles.premiumTitle}>Premium</Text>
          <Text style={styles.premiumText}>AI review, calm rewrites, Coach, longer messages, Personal Boundaries and PDF export will be added on top of the same calm communication rules.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator /><Text style={styles.smallNote}>Opening TalkTwo…</Text></SafeAreaView>;
  }
  return session ? <HomeScreen session={session} /> : <LoginScreen />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F2' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F5F5F2' },
  container: { padding: 22, gap: 16 },
  header: { marginTop: 24, marginBottom: 8 },
  headerRow: { marginTop: 16, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontSize: 34, fontWeight: '800', color: '#161616' },
  tagline: { marginTop: 4, fontSize: 14, color: '#666' },
  signOut: { fontWeight: '700', color: '#555' },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E5E5E0', gap: 12 },
  label: { fontSize: 14, fontWeight: '700', marginTop: 4, color: '#333' },
  singleInput: { minHeight: 50, borderWidth: 1, borderColor: '#DADAD5', borderRadius: 12, paddingHorizontal: 14, fontSize: 16, backgroundColor: '#FFF' },
  input: { minHeight: 130, fontSize: 18, lineHeight: 25, textAlignVertical: 'top', color: '#111' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  counter: { color: '#666' },
  counterDanger: { color: '#8A1C1C', fontWeight: '700' },
  plan: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: '#555' },
  approved: { borderColor: '#6F8E73' },
  blocked: { borderColor: '#A66A6A' },
  statusTitle: { fontSize: 20, fontWeight: '800', color: '#161616' },
  statusText: { fontSize: 15, lineHeight: 21, color: '#555' },
  smallNote: { color: '#666', lineHeight: 20 },
  connectionCount: { fontWeight: '700', color: '#333' },
  reason: { marginTop: 4, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#ECECE8' },
  reasonTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  reasonText: { marginTop: 4, fontSize: 14, lineHeight: 20, color: '#555' },
  suggestion: { marginTop: 6, fontSize: 14, lineHeight: 20, fontWeight: '600', color: '#303030' },
  button: { backgroundColor: '#171717', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' },
  buttonSecondary: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CFCFC9' },
  buttonDisabled: { opacity: 0.3 },
  buttonText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  buttonTextSecondary: { color: '#222' },
  premiumCard: { padding: 18, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: '#B9B9B2' },
  premiumTitle: { fontSize: 15, fontWeight: '800', color: '#333' },
  premiumText: { marginTop: 5, color: '#666', lineHeight: 20 },
});

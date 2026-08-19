import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { createSessionFromMagicLink, sendMagicLink, signOut } from './src/services/auth';
import {
  acceptInvitation,
  createInvitation,
  listRelationships,
  type RelationshipSummary,
} from './src/services/relationships';
import { listMessages, openMessage, sendMessage, withdrawMessage, type ChatMessage } from './src/services/messages';

function Button({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.buttonDisabled]}>
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text>
    </TouchableOpacity>
  );
}

function invitationTokenFromUrl(url: string) {
  const match = url.match(/^talktwo:\/\/invite\/([^?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function requestLink() {
    try {
      setBusy(true);
      const normalized = await sendMagicLink(email);
      setSentEmail(normalized);
    } catch (error) {
      Alert.alert('Could not send sign-in email', error instanceof Error ? error.message : 'Please try again.');
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
          {!sentEmail ? <>
            <Text style={styles.statusText}>Enter your email. We will send you a secure sign-in link. No password needed.</Text>
            <Text style={styles.label}>Email</Text>
            <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" style={styles.singleInput} />
            <Button title={busy ? 'Sending…' : 'Email me a sign-in link'} onPress={requestLink} disabled={busy || !email.includes('@')} />
          </> : <>
            <Text style={styles.statusText}>We sent a sign-in link to:</Text>
            <Text style={styles.emailEmphasis}>{sentEmail}</Text>
            <Text style={styles.smallNote}>Open the email on this phone and tap “Sign in”. TalkTwo should open automatically.</Text>
            <Button title="Use another email" onPress={() => { setSentEmail(''); setEmail(''); }} secondary />
          </>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ChatView({ relationship, session, onBack }: { relationship: RelationshipSummary; session: Session; onBack: () => void }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const result = useMemo(() => evaluateFreeMessage(message), [message]);
  const hasText = message.trim().length > 0;

  async function refresh() {
    try {
      setMessages(await listMessages(relationship.id));
    } catch (error) {
      Alert.alert('Could not load messages', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  useEffect(() => { void refresh(); }, [relationship.id]);

  async function send() {
    if (!result.canSend) return;
    try {
      setBusy(true);
      await sendMessage(relationship.id, message);
      setMessage('');
      await refresh();
    } catch (error) {
      Alert.alert('Message was not sent', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function openIncoming(item: ChatMessage) {
    try {
      await openMessage(item.id);
      await refresh();
    } catch (error) {
      Alert.alert('Message cannot be opened yet', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function withdraw(item: ChatMessage) {
    try {
      const changed = await withdrawMessage(item.id);
      if (!changed) Alert.alert('Too late to withdraw', 'The recipient has already opened this message.');
      await refresh();
    } catch (error) {
      Alert.alert('Could not withdraw message', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ Connections</Text></TouchableOpacity>
          <Text style={styles.plan}>FREE</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.statusTitle}>Conversation</Text>
          <Text style={styles.smallNote}>Only messages that pass TalkTwo's communication rules can be sent.</Text>
        </View>

        <View style={styles.messageList}>
          {messages.length === 0 ? <Text style={styles.empty}>No messages yet.</Text> : messages.map((item) => {
            const mine = item.sender_id === session.user.id;
            const opened = Boolean(item.opened_at);
            const hideIncomingBody = !mine && !opened;
            return (
              <View key={item.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={styles.bubbleMeta}>{mine ? 'You' : 'Other person'} · {new Date(item.created_at).toLocaleString()}</Text>
                {hideIncomingBody ? (
                  <>
                    <Text style={styles.waitingTitle}>New message</Text>
                    <Text style={styles.smallNote}>The message text stays hidden until you choose to open it.</Text>
                    <Button title="Open message" onPress={() => void openIncoming(item)} secondary />
                  </>
                ) : (
                  <Text style={styles.bubbleText}>{item.body}</Text>
                )}
                {mine ? <View style={styles.bubbleFooter}>
                  <Text style={styles.delivery}>{opened ? 'Opened' : 'Sent'}</Text>
                  {!opened && <TouchableOpacity onPress={() => void withdraw(item)}><Text style={styles.withdraw}>Withdraw</Text></TouchableOpacity>}
                </View> : null}
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>New message</Text>
          <TextInput multiline value={message} onChangeText={setMessage} placeholder="Write a short practical message…" style={styles.input} maxLength={500} />
          <View style={styles.row}>
            <Text style={[styles.counter, message.length > MAX_FREE_LENGTH && styles.counterDanger]}>{message.length}/{MAX_FREE_LENGTH}</Text>
            <Text style={styles.plan}>FREE</Text>
          </View>
          {hasText && !result.canSend && <View style={styles.blockedBox}>
            <Text style={styles.reasonTitle}>Message blocked</Text>
            {result.reasons.map((reason, index) => <View key={`${reason.code}-${index}`} style={styles.reason}>
              <Text style={styles.reasonTitle}>{reason.title}</Text>
              <Text style={styles.reasonText}>{reason.explanation}</Text>
              <Text style={styles.suggestion}>{reason.suggestion}</Text>
            </View>)}
          </View>}
          {hasText && result.canSend && <Text style={styles.approvedText}>Ready to send.</Text>}
          <Button title={busy ? 'Sending…' : 'Send'} onPress={() => void send()} disabled={busy || !hasText || !result.canSend} />
        </View>

        <Button title="Refresh messages" onPress={() => void refresh()} secondary />
      </ScrollView>
    </SafeAreaView>
  );
}

function HomeScreen({ session, pendingInvite, clearPendingInvite }: { session: Session; pendingInvite: string | null; clearPendingInvite: () => void }) {
  const [relationships, setRelationships] = useState<RelationshipSummary[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<RelationshipSummary | null>(null);

  async function refreshRelationships() {
    try { setRelationships(await listRelationships()); }
    catch (error) { Alert.alert('Could not load connections', error instanceof Error ? error.message : 'Please try again.'); }
  }

  useEffect(() => { void refreshRelationships(); }, []);
  useEffect(() => { if (pendingInvite) setInviteCode(pendingInvite); }, [pendingInvite]);

  async function makeInvite() {
    try {
      setBusy(true);
      const invite = await createInvitation();
      await Share.share({ message: `I have invited you to TalkTwo. Open this link on your phone after installing TalkTwo: talktwo://invite/${invite.token}` });
      await refreshRelationships();
    } catch (error) {
      Alert.alert('Could not create invitation', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  async function joinWithCode() {
    try {
      setBusy(true);
      await acceptInvitation(inviteCode);
      setInviteCode('');
      clearPendingInvite();
      await refreshRelationships();
      Alert.alert('Connected', 'This TalkTwo connection is now active.');
    } catch (error) {
      Alert.alert('Invitation not accepted', error instanceof Error ? error.message : 'Check the invitation and try again.');
    } finally { setBusy(false); }
  }

  if (selected) return <ChatView relationship={selected} session={session} onBack={() => setSelected(null)} />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View><Text style={styles.brand}>TalkTwo</Text><Text style={styles.tagline}>{session.user.email}</Text></View>
          <TouchableOpacity onPress={() => void signOut()}><Text style={styles.signOut}>Sign out</Text></TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.statusTitle}>Connections</Text>
          <Text style={styles.statusText}>Each connection is a separate private conversation.</Text>
          {relationships.map((rel, index) => (
            <TouchableOpacity key={rel.id} onPress={() => setSelected(rel)} style={styles.connectionRow}>
              <View><Text style={styles.reasonTitle}>Connection {index + 1}</Text><Text style={styles.smallNote}>{rel.status === 'active' ? 'Active' : rel.status}</Text></View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
          {relationships.length === 0 && <Text style={styles.smallNote}>No active connections yet.</Text>}
          <Button title={busy ? 'Please wait…' : 'Invite someone'} onPress={makeInvite} disabled={busy} />
          {inviteCode ? <View style={styles.inviteNotice}>
            <Text style={styles.reasonTitle}>Invitation ready</Text>
            <Text style={styles.reasonText}>Accepting connects this account to the person who sent the invitation.</Text>
            <Button title="Accept invitation" onPress={joinWithCode} disabled={busy} secondary />
          </View> : null}
        </View>

        <View style={styles.premiumCard}>
          <Text style={styles.premiumTitle}>Premium</Text>
          <Text style={styles.premiumText}>AI review, calm rewrites, Coach, longer messages, Personal Boundaries and PDF export will sit on top of the same communication rules.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);

  useEffect(() => {
    async function handleUrl(url: string | null) {
      if (!url) return;
      const inviteToken = invitationTokenFromUrl(url);
      if (inviteToken) { setPendingInvite(inviteToken); return; }
      if (url.toLowerCase().startsWith('talktwo://auth')) {
        try { await createSessionFromMagicLink(url); }
        catch (error) { Alert.alert('Sign-in link could not be used', error instanceof Error ? error.message : 'Please request a new link.'); }
      }
    }

    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    void Linking.getInitialURL().then(handleUrl);
    const linking = Linking.addEventListener('url', ({ url }) => { void handleUrl(url); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { linking.remove(); listener.subscription.unsubscribe(); };
  }, []);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator /><Text style={styles.smallNote}>Opening TalkTwo…</Text></SafeAreaView>;
  return session ? <HomeScreen session={session} pendingInvite={pendingInvite} clearPendingInvite={() => setPendingInvite(null)} /> : <LoginScreen />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F2' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F5F5F2' },
  container: { padding: 22, gap: 16 },
  header: { marginTop: 24, marginBottom: 8 },
  headerRow: { marginTop: 16, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontSize: 34, fontWeight: '800', color: '#161616' },
  tagline: { marginTop: 4, fontSize: 14, color: '#666' },
  emailEmphasis: { fontSize: 16, fontWeight: '800', color: '#222' },
  signOut: { fontWeight: '700', color: '#555' },
  back: { fontWeight: '800', color: '#333', fontSize: 16 },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E5E5E0', gap: 12 },
  label: { fontSize: 14, fontWeight: '700', marginTop: 4, color: '#333' },
  singleInput: { minHeight: 50, borderWidth: 1, borderColor: '#DADAD5', borderRadius: 12, paddingHorizontal: 14, fontSize: 16, backgroundColor: '#FFF' },
  input: { minHeight: 110, fontSize: 18, lineHeight: 25, textAlignVertical: 'top', color: '#111' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  counter: { color: '#666' },
  counterDanger: { color: '#8A1C1C', fontWeight: '700' },
  plan: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: '#555' },
  statusTitle: { fontSize: 20, fontWeight: '800', color: '#161616' },
  statusText: { fontSize: 15, lineHeight: 21, color: '#555' },
  smallNote: { color: '#666', lineHeight: 20 },
  empty: { textAlign: 'center', color: '#777', paddingVertical: 18 },
  inviteNotice: { gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ECECE8' },
  connectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#ECECE8' },
  chevron: { fontSize: 28, color: '#777' },
  messageList: { gap: 10 },
  bubble: { borderRadius: 16, padding: 14, borderWidth: 1, maxWidth: '92%' },
  mine: { alignSelf: 'flex-end', backgroundColor: '#FFF', borderColor: '#D9D9D3' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#F0F0EC', borderColor: '#D9D9D3' },
  bubbleMeta: { fontSize: 11, color: '#777', marginBottom: 6 },
  bubbleText: { fontSize: 16, lineHeight: 22, color: '#171717' },
  waitingTitle: { fontSize: 16, fontWeight: '800', color: '#222', marginBottom: 4 },
  bubbleFooter: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  delivery: { fontSize: 12, color: '#777' },
  withdraw: { fontSize: 12, fontWeight: '800', color: '#555' },
  blockedBox: { borderTopWidth: 1, borderTopColor: '#E5E5E0', paddingTop: 12 },
  approvedText: { color: '#416747', fontWeight: '800' },
  reason: { marginTop: 10 },
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

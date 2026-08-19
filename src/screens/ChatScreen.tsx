import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { evaluateFreeMessage, MAX_FREE_LENGTH } from '../filter/freeFilter';
import { listMessages, openMessage, sendMessage, withdrawMessage, type ChatMessage } from '../services/messages';
import type { RelationshipSummary } from '../services/relationships';
import { getPartnerWindows } from '../services/windows';

function Button({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text></TouchableOpacity>;
}

export default function ChatScreen({ relationship, session, onBack }: { relationship: RelationshipSummary; session: Session; onBack: () => void }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [partnerTimezone, setPartnerTimezone] = useState<string | null>(null);
  const result = useMemo(() => evaluateFreeMessage(message), [message]);
  const hasText = message.trim().length > 0;

  async function refresh() {
    try { setMessages(await listMessages(relationship.id)); }
    catch (error) { Alert.alert('Could not load messages', error instanceof Error ? error.message : 'Please try again.'); }
  }

  useEffect(() => {
    void refresh();
    void getPartnerWindows(relationship.id).then((rows) => setPartnerTimezone(rows[0]?.timezone ?? null)).catch(() => undefined);
  }, [relationship.id]);

  async function send() {
    if (!result.canSend) return;
    try {
      setBusy(true);
      await sendMessage(relationship.id, message);
      setMessage('');
      await refresh();
    } catch (error) {
      Alert.alert('Message was not sent', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  async function openIncoming(item: ChatMessage) {
    try { await openMessage(item.id); await refresh(); }
    catch (error) { Alert.alert('Message cannot be opened yet', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function withdraw(item: ChatMessage) {
    try {
      const changed = await withdrawMessage(item.id);
      if (!changed) Alert.alert('Too late to withdraw', 'The recipient has already opened this message.');
      await refresh();
    } catch (error) { Alert.alert('Could not withdraw message', error instanceof Error ? error.message : 'Please try again.'); }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ Connections</Text></TouchableOpacity>
          <Text style={styles.plan}>FREE</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Conversation</Text>
          <Text style={styles.help}>Only messages that pass TalkTwo's communication rules can be sent.</Text>
          {partnerTimezone ? <Text style={styles.tz}>Other person's timezone: {partnerTimezone}</Text> : null}
        </View>

        <View style={styles.messageList}>
          {messages.length === 0 ? <Text style={styles.empty}>No messages yet.</Text> : messages.map((item) => {
            const mine = item.sender_id === session.user.id;
            const opened = Boolean(item.opened_at);
            const hideIncomingBody = !mine && !opened;
            return (
              <View key={item.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={styles.meta}>{mine ? 'You' : 'Other person'} · {new Date(item.created_at).toLocaleString()}</Text>
                {hideIncomingBody ? <>
                  <Text style={styles.waiting}>New message</Text>
                  <Text style={styles.help}>The message text stays hidden until you choose to open it.</Text>
                  <Button title="Open message" onPress={() => void openIncoming(item)} secondary />
                </> : <Text style={styles.body}>{item.body}</Text>}
                {mine ? <View style={styles.footer}><Text style={styles.delivery}>{opened ? 'Opened' : 'Sent'}</Text>{!opened ? <TouchableOpacity onPress={() => void withdraw(item)}><Text style={styles.withdraw}>Withdraw</Text></TouchableOpacity> : null}</View> : null}
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>New message</Text>
          <TextInput multiline value={message} onChangeText={setMessage} placeholder="Write a short practical message…" style={styles.input} maxLength={500} />
          <View style={styles.row}><Text style={[styles.counter, message.length > MAX_FREE_LENGTH && styles.danger]}>{message.length}/{MAX_FREE_LENGTH}</Text><Text style={styles.plan}>FREE</Text></View>
          {hasText && !result.canSend ? <View style={styles.blocked}><Text style={styles.reasonTitle}>Message blocked</Text>{result.reasons.map((reason, index) => <View key={`${reason.code}-${index}`} style={styles.reason}><Text style={styles.reasonTitle}>{reason.title}</Text><Text style={styles.help}>{reason.explanation}</Text><Text style={styles.suggestion}>{reason.suggestion}</Text></View>)}</View> : null}
          {hasText && result.canSend ? <Text style={styles.approved}>Ready to send.</Text> : null}
          <Button title={busy ? 'Sending…' : 'Send'} onPress={() => void send()} disabled={busy || !hasText || !result.canSend} />
        </View>
        <Button title="Refresh messages" onPress={() => void refresh()} secondary />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F2' },
  container: { padding: 22, gap: 16 },
  headerRow: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontWeight: '800', color: '#333', fontSize: 16 },
  plan: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: '#555' },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E5E5E0', gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#161616' },
  help: { color: '#666', lineHeight: 20 },
  tz: { fontSize: 12, color: '#777' },
  messageList: { gap: 10 },
  empty: { textAlign: 'center', color: '#777', paddingVertical: 18 },
  bubble: { borderRadius: 16, padding: 14, borderWidth: 1, maxWidth: '92%' },
  mine: { alignSelf: 'flex-end', backgroundColor: '#FFF', borderColor: '#D9D9D3' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#F0F0EC', borderColor: '#D9D9D3' },
  meta: { fontSize: 11, color: '#777', marginBottom: 6 },
  waiting: { fontSize: 16, fontWeight: '800', color: '#222', marginBottom: 4 },
  body: { fontSize: 16, lineHeight: 22, color: '#171717' },
  footer: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  delivery: { fontSize: 12, color: '#777' },
  withdraw: { fontSize: 12, fontWeight: '800', color: '#555' },
  label: { fontSize: 14, fontWeight: '700', color: '#333' },
  input: { minHeight: 110, fontSize: 18, lineHeight: 25, textAlignVertical: 'top', color: '#111' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  counter: { color: '#666' },
  danger: { color: '#8A1C1C', fontWeight: '700' },
  blocked: { borderTopWidth: 1, borderTopColor: '#E5E5E0', paddingTop: 12 },
  reason: { marginTop: 10 },
  reasonTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  suggestion: { marginTop: 6, fontWeight: '600', color: '#303030' },
  approved: { color: '#416747', fontWeight: '800' },
  button: { backgroundColor: '#171717', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' },
  secondary: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CFCFC9' },
  disabled: { opacity: 0.3 },
  buttonText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  secondaryText: { color: '#222' },
});

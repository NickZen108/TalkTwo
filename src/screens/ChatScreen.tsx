import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { evaluateFreeMessage, MAX_FREE_LENGTH } from '../filter/freeFilter';
import { editUnopenedMessage, listMessages, openMessage, rejectMessageWithoutOpening, sendMessage, withdrawMessage, type ChatMessage } from '../services/messages';
import { analyzePremiumMessage, getMyPlan, startPremiumTrial, type AiReview, type UserPlan } from '../services/premium';
import type { RelationshipSummary } from '../services/relationships';
import { getPartnerWindows } from '../services/windows';

const MAX_PREMIUM_LENGTH = 480;

function Button({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text></TouchableOpacity>;
}

function isPremiumActive(plan: UserPlan | null) {
  if (!plan) return false;
  const now = Date.now();
  if (plan.plan === 'trial') return Boolean(plan.trial_ends_at && new Date(plan.trial_ends_at).getTime() > now);
  if (plan.plan === 'premium') return !plan.premium_ends_at || new Date(plan.premium_ends_at).getTime() > now;
  return false;
}

export default function ChatScreen({ relationship, session, onBack }: { relationship: RelationshipSummary; session: Session; onBack: () => void }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [partnerTimezone, setPartnerTimezone] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [plan, setPlan] = useState<UserPlan | null>(null);
  const [review, setReview] = useState<AiReview | null>(null);
  const [reviewedText, setReviewedText] = useState('');
  const [trialFallback, setTrialFallback] = useState(false);
  const freeResult = useMemo(() => evaluateFreeMessage(message), [message]);
  const hasText = message.trim().length > 0;
  const premiumEntitled = isPremiumActive(plan);
  const premiumAi = premiumEntitled && !trialFallback;
  const maxLength = premiumAi ? MAX_PREMIUM_LENGTH : MAX_FREE_LENGTH;
  const reviewCurrent = premiumAi && review && reviewedText === message.trim();
  const canSendPremium = Boolean(reviewCurrent && review?.can_send && message.trim().length <= MAX_PREMIUM_LENGTH);
  const canSend = premiumAi ? canSendPremium : freeResult.canSend;

  async function refresh() {
    try { setMessages(await listMessages(relationship.id)); }
    catch (error) { Alert.alert('Could not load messages', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function refreshPlan() {
    try { setPlan(await getMyPlan()); }
    catch { setPlan(null); }
  }

  useEffect(() => {
    void refresh();
    void refreshPlan();
    void getPartnerWindows(relationship.id).then((rows) => setPartnerTimezone(rows[0]?.timezone ?? null)).catch(() => undefined);
  }, [relationship.id]);

  function changeMessage(text: string) {
    setMessage(text);
    if (text.trim() !== reviewedText) setReview(null);
  }

  async function startTrial() {
    try {
      setBusy(true);
      const next = await startPremiumTrial();
      setPlan(next);
      setTrialFallback(false);
      Alert.alert('Premium trial started', 'You have 7 days of Premium, including AI review. Trial AI use is capped at 25 analyses per day.');
    } catch (error) {
      Alert.alert('Trial could not start', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  async function reviewWithAi() {
    const draft = message.trim();
    if (!draft || draft.length > MAX_PREMIUM_LENGTH) return;
    try {
      setReviewBusy(true);
      const next = await analyzePremiumMessage(relationship.id, draft);
      setReview(next);
      setReviewedText(draft);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Please try again.';
      if (text.toLowerCase().includes('daily trial limit')) {
        setTrialFallback(true);
        setReview(null);
        setReviewedText('');
        Alert.alert('Daily AI limit reached', 'For the rest of today, TalkTwo automatically falls back to the Free filter. Messages are limited to 160 characters.');
      } else {
        Alert.alert('AI review unavailable', text);
      }
    } finally { setReviewBusy(false); }
  }

  async function send() {
    if (!canSend) return;
    try {
      setBusy(true);
      if (editing) await editUnopenedMessage(editing.id, message.trim());
      else await sendMessage(relationship.id, message.trim());
      setMessage('');
      setEditing(null);
      setReview(null);
      setReviewedText('');
      await refresh();
    } catch (error) {
      Alert.alert(editing ? 'Message could not be edited' : 'Message was not sent', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  function startEdit(item: ChatMessage) {
    setEditing(item);
    setMessage(item.body);
    setReview(null);
    setReviewedText('');
  }

  async function openIncoming(item: ChatMessage) {
    try { await openMessage(item.id); await refresh(); }
    catch (error) { Alert.alert('Message cannot be opened yet', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function rejectIncoming(item: ChatMessage) {
    try {
      const rejected = await rejectMessageWithoutOpening(item.id);
      if (!rejected) Alert.alert('Message could not be rejected', 'It may already have been opened or withdrawn.');
      await refresh();
    } catch (error) { Alert.alert('Message could not be rejected', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function withdraw(item: ChatMessage) {
    try {
      const changed = await withdrawMessage(item.id);
      if (!changed) Alert.alert('Too late to withdraw', 'The message can no longer be withdrawn.');
      if (editing?.id === item.id) { setEditing(null); setMessage(''); }
      await refresh();
    } catch (error) { Alert.alert('Could not withdraw message', error instanceof Error ? error.message : 'Please try again.'); }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ Connections</Text></TouchableOpacity>
          <Text style={styles.plan}>{premiumEntitled ? 'PREMIUM' : 'FREE'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Conversation</Text>
          <Text style={styles.help}>Only messages that pass TalkTwo's communication rules can be sent.</Text>
          {partnerTimezone ? <Text style={styles.tz}>Other person's timezone: {partnerTimezone}</Text> : null}
          {!premiumEntitled && plan?.plan === 'free' ? <Button title="Start 7-day Premium trial" onPress={() => void startTrial()} disabled={busy} secondary /> : null}
          {plan?.plan === 'trial' && plan.trial_ends_at ? <Text style={styles.tz}>Trial ends {new Date(plan.trial_ends_at).toLocaleDateString()}.</Text> : null}
          {trialFallback ? <Text style={styles.help}>Today's 25 AI reviews are used. Free filtering is active until the daily allowance resets.</Text> : null}
        </View>

        <View style={styles.messageList}>
          {messages.length === 0 ? <Text style={styles.empty}>No messages yet.</Text> : messages.map((item) => {
            const mine = item.sender_id === session.user.id;
            const opened = Boolean(item.opened_at);
            const rejected = Boolean(item.rejected_at);
            const hideIncomingBody = !mine && !opened;
            return (
              <View key={item.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={styles.meta}>{mine ? 'You' : 'Other person'} · {new Date(item.created_at).toLocaleString()}{item.edited_at ? ' · edited' : ''}{item.risk_level === 'yellow' ? ' · caution' : ''}</Text>
                {mine && rejected ? <Text style={styles.waiting}>Rejected without opening</Text> : hideIncomingBody ? <>
                  <Text style={styles.waiting}>{item.risk_level === 'yellow' ? 'Potentially sensitive message' : 'New message'}</Text>
                  <Text style={styles.help}>{item.risk_level === 'yellow' ? 'TalkTwo marked this message as potentially conflict-escalating. You can open it or reject it without reading.' : 'The message text stays hidden until you choose to open it.'}</Text>
                  <Button title="Open message" onPress={() => void openIncoming(item)} secondary />
                  {item.risk_level === 'yellow' ? <Button title="Reject without reading" onPress={() => void rejectIncoming(item)} secondary /> : null}
                </> : <Text style={styles.body}>{item.body}</Text>}
                {mine ? <View style={styles.footer}>
                  <Text style={styles.delivery}>{rejected ? 'Rejected without opening' : 'Sent'}</Text>
                  {!opened && !rejected ? <View style={styles.actions}><TouchableOpacity onPress={() => startEdit(item)}><Text style={styles.action}>Edit</Text></TouchableOpacity><TouchableOpacity onPress={() => void withdraw(item)}><Text style={styles.action}>Withdraw</Text></TouchableOpacity></View> : null}
                </View> : null}
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>{editing ? 'Edit message' : 'New message'}</Text>
          {editing ? <Text style={styles.help}>You can change this because the recipient has not opened it. Edited Premium messages are reviewed again.</Text> : null}
          <TextInput multiline value={message} onChangeText={changeMessage} placeholder="Write a short practical message…" style={styles.input} maxLength={MAX_PREMIUM_LENGTH} />
          <View style={styles.row}><Text style={[styles.counter, message.length > maxLength && styles.danger]}>{message.length}/{maxLength}</Text><Text style={styles.plan}>{premiumAi ? 'PREMIUM AI' : 'FREE FILTER'}</Text></View>

          {premiumAi ? <>
            {hasText && !reviewCurrent ? <Text style={styles.help}>Premium checks this exact text with AI before it can be sent.</Text> : null}
            <Button title={reviewBusy ? 'Reviewing…' : 'Review with AI'} onPress={() => void reviewWithAi()} disabled={reviewBusy || busy || !hasText || message.length > MAX_PREMIUM_LENGTH} secondary />
            {reviewCurrent ? <View style={[styles.reviewBox, review?.level === 'red' ? styles.reviewRed : review?.level === 'yellow' ? styles.reviewYellow : styles.reviewGreen]}>
              <Text style={styles.reasonTitle}>{review?.level === 'green' ? 'Ready to send' : review?.level === 'yellow' ? 'Caution' : 'Message blocked'}</Text>
              <Text style={styles.help}>{review?.reason}</Text>
              {review?.problematic_text?.length ? <Text style={styles.suggestion}>Flagged: {review.problematic_text.join(' · ')}</Text> : null}
              {review?.rewrite ? <TouchableOpacity onPress={() => changeMessage(review.rewrite ?? '')}><Text style={styles.rewrite}>Use Coach rewrite</Text></TouchableOpacity> : null}
              {review?.usage?.analyses_remaining !== undefined && review.usage.analyses_remaining >= 0 ? <Text style={styles.tz}>{review.usage.analyses_remaining} AI reviews left today in trial.</Text> : null}
            </View> : null}
          </> : <>
            {hasText && !freeResult.canSend ? <View style={styles.blocked}><Text style={styles.reasonTitle}>Message blocked</Text>{freeResult.reasons.map((reason, index) => <View key={`${reason.code}-${index}`} style={styles.reason}><Text style={styles.reasonTitle}>{reason.title}</Text><Text style={styles.help}>{reason.explanation}</Text><Text style={styles.suggestion}>{reason.suggestion}</Text></View>)}</View> : null}
            {hasText && freeResult.canSend ? <Text style={styles.approved}>Ready to send.</Text> : null}
          </>}

          <Button title={busy ? 'Saving…' : editing ? 'Save changes' : 'Send'} onPress={() => void send()} disabled={busy || !hasText || !canSend || message.length > maxLength} />
          {editing ? <Button title="Cancel edit" onPress={() => { setEditing(null); setMessage(''); setReview(null); setReviewedText(''); }} secondary /> : null}
        </View>
        <Button title="Refresh messages" onPress={() => void refresh()} secondary />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F2' }, container: { padding: 22, gap: 16 },
  headerRow: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, back: { fontWeight: '800', color: '#333', fontSize: 16 }, plan: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: '#555' },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E5E5E0', gap: 12 }, title: { fontSize: 20, fontWeight: '800', color: '#161616' }, help: { color: '#666', lineHeight: 20 }, tz: { fontSize: 12, color: '#777' },
  messageList: { gap: 10 }, empty: { textAlign: 'center', color: '#777', paddingVertical: 18 }, bubble: { borderRadius: 16, padding: 14, borderWidth: 1, maxWidth: '92%' }, mine: { alignSelf: 'flex-end', backgroundColor: '#FFF', borderColor: '#D9D9D3' }, theirs: { alignSelf: 'flex-start', backgroundColor: '#F0F0EC', borderColor: '#D9D9D3' }, meta: { fontSize: 11, color: '#777', marginBottom: 6 }, waiting: { fontSize: 16, fontWeight: '800', color: '#222', marginBottom: 4 }, body: { fontSize: 16, lineHeight: 22, color: '#171717' },
  footer: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 16 }, delivery: { fontSize: 12, color: '#777' }, actions: { flexDirection: 'row', gap: 14 }, action: { fontSize: 12, fontWeight: '800', color: '#555' },
  label: { fontSize: 14, fontWeight: '700', color: '#333' }, input: { minHeight: 110, fontSize: 18, lineHeight: 25, textAlignVertical: 'top', color: '#111' }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, counter: { color: '#666' }, danger: { color: '#8A1C1C', fontWeight: '700' }, blocked: { borderTopWidth: 1, borderTopColor: '#E5E5E0', paddingTop: 12 }, reason: { marginTop: 10 }, reasonTitle: { fontSize: 16, fontWeight: '700', color: '#222' }, suggestion: { marginTop: 6, fontWeight: '600', color: '#303030' }, approved: { color: '#416747', fontWeight: '800' },
  reviewBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 }, reviewGreen: { borderColor: '#9FB6A3' }, reviewYellow: { borderColor: '#B9A76A' }, reviewRed: { borderColor: '#B68A8A' }, rewrite: { fontWeight: '800', textDecorationLine: 'underline', color: '#333' },
  button: { backgroundColor: '#171717', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' }, secondary: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CFCFC9' }, disabled: { opacity: 0.3 }, buttonText: { color: '#FFF', fontWeight: '800', fontSize: 15 }, secondaryText: { color: '#222' },
});

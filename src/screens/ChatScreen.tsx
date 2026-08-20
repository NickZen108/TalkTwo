import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, RefreshControl, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { BACKGROUND_THEMES, BUBBLE_THEMES, initialsForName, safeBackgroundTheme, safeBubbleTheme, textColorForBackground, type BackgroundThemeName, type BubbleThemeName } from '../domain/chatPresentation';
import { countMessageCharacters, evaluateFreeMessage, MAX_FREE_LENGTH } from '../filter/freeFilter';
import { getConversationTheme, listMemberPreferences } from '../services/localDb';
import { editUnopenedMessage, listMessages, openMessage, rejectMessageWithoutOpening, sendMessage, withdrawMessage, type ChatMessage } from '../services/messages';
import { analyzePremiumMessage, getMyPlan, startPremiumTrial, type AiReview, type UserPlan } from '../services/premium';
import { listRelationshipMembers, type RelationshipMember, type RelationshipSummary } from '../services/relationships';
import { getPartnerWindows } from '../services/windows';
import ChatSettingsScreen from './ChatSettingsScreen';

const MAX_PREMIUM_LENGTH = 480;

type MemberLook = { name: string; bubble: BubbleThemeName };

function isPremiumActive(plan: UserPlan | null) {
  if (!plan) return false;
  const now = Date.now();
  if (plan.plan === 'trial') return Boolean(plan.trial_ends_at && new Date(plan.trial_ends_at).getTime() > now);
  if (plan.plan === 'premium') return !plan.premium_ends_at || new Date(plan.premium_ends_at).getTime() > now;
  return false;
}

function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function dateLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function PatternBackdrop({ theme }: { theme: BackgroundThemeName }) {
  if (BACKGROUND_THEMES[theme].pattern !== 'dots') return null;
  return (
    <View pointerEvents="none" style={styles.pattern}>
      {Array.from({ length: 54 }, (_, index) => <View key={index} style={styles.patternDot} />)}
    </View>
  );
}

function CompactButton({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return (
    <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.compactButton, secondary && styles.compactSecondary, disabled && styles.disabled]}>
      <Text style={[styles.compactButtonText, secondary && styles.compactSecondaryText]}>{title}</Text>
    </TouchableOpacity>
  );
}

export default function ChatScreen({ relationship, session, onBack }: { relationship: RelationshipSummary; session: Session; onBack: () => void }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<RelationshipMember[]>([]);
  const [memberLooks, setMemberLooks] = useState<Record<string, MemberLook>>({});
  const [background, setBackground] = useState<BackgroundThemeName>('paper');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [partnerTimezone, setPartnerTimezone] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [plan, setPlan] = useState<UserPlan | null>(null);
  const [review, setReview] = useState<AiReview | null>(null);
  const [reviewedText, setReviewedText] = useState('');
  const [trialFallback, setTrialFallback] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const freeResult = useMemo(() => evaluateFreeMessage(message), [message]);
  const hasText = message.trim().length > 0;
  const messageLength = countMessageCharacters(message.trim());
  const premiumEntitled = isPremiumActive(plan);
  const premiumAi = premiumEntitled && !trialFallback;
  const maxLength = premiumAi ? MAX_PREMIUM_LENGTH : MAX_FREE_LENGTH;
  const reviewCurrent = Boolean(premiumAi && review && reviewedText === message.trim());
  const canSendPremium = Boolean(reviewCurrent && review?.can_send && messageLength <= MAX_PREMIUM_LENGTH);
  const canCompose = relationship.my_role === 'participant';
  const canSend = canCompose && (premiumAi ? canSendPremium : freeResult.canSend) && messageLength <= maxLength;

  async function refreshMessages() {
    setMessages(await listMessages(relationship.id));
  }

  async function refreshPlan() {
    const next = await getMyPlan();
    setPlan(next);
    setTrialFallback(next.plan === 'trial' && next.analyses_remaining_today === 0);
  }

  async function refreshAppearance() {
    const [nextMembers, preferences, theme] = await Promise.all([
      listRelationshipMembers(relationship.id),
      listMemberPreferences(session.user.id, relationship.id),
      getConversationTheme(session.user.id, relationship.id),
    ]);
    const prefMap = new Map(preferences.map((item) => [item.member_user_id, item]));
    const looks: Record<string, MemberLook> = {};
    for (const member of nextMembers) {
      const preference = prefMap.get(member.user_id);
      looks[member.user_id] = {
        name: preference?.local_alias?.trim() || member.display_name || 'Member',
        bubble: safeBubbleTheme(preference?.bubble_theme ?? (member.user_id === session.user.id ? 'sage' : 'grey')),
      };
    }
    setMembers(nextMembers);
    setMemberLooks(looks);
    setBackground(safeBackgroundTheme(theme));
  }

  async function refreshAll() {
    await Promise.all([
      refreshMessages(),
      refreshPlan(),
      refreshAppearance(),
      getPartnerWindows(relationship.id).then((rows) => setPartnerTimezone(rows[0]?.timezone ?? null)).catch(() => undefined),
    ]);
  }

  useEffect(() => {
    void refreshAll().catch((error) => Alert.alert('Could not open chat', error instanceof Error ? error.message : 'Please try again.'));
  }, [relationship.id]);

  function changeMessage(text: string) {
    const changedFromReviewedText = text.trim() !== reviewedText;
    const previousReviewUsedLastTrialAnalysis = plan?.plan === 'trial' && review?.usage?.analyses_remaining === 0;
    setMessage(text);
    if (changedFromReviewedText) {
      setReview(null);
      if (previousReviewUsedLastTrialAnalysis) setTrialFallback(true);
    }
  }

  async function startTrial() {
    try {
      setBusy(true);
      const next = await startPremiumTrial();
      setPlan(next);
      setTrialFallback(false);
      Alert.alert('Premium trial started', 'You have 7 days of Premium. Trial AI review is limited to 25 analyses per local day.');
    } catch (error) {
      Alert.alert('Trial could not start', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function reviewWithAi() {
    const draft = message.trim();
    if (!draft || messageLength > MAX_PREMIUM_LENGTH) return;
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
        Alert.alert('Daily AI limit reached', 'TalkTwo now uses the Free filter until your next local day.');
      } else {
        Alert.alert('AI review unavailable', text);
      }
    } finally {
      setReviewBusy(false);
    }
  }

  async function saveOrSend() {
    if (!canSend) return;
    const lastTrialReview = plan?.plan === 'trial' && reviewCurrent && review?.usage?.analyses_remaining === 0;
    try {
      setBusy(true);
      if (editing) await editUnopenedMessage(editing.logical_id, relationship.id, message.trim());
      else await sendMessage(relationship.id, message.trim());
      setMessage('');
      setEditing(null);
      setReview(null);
      setReviewedText('');
      if (lastTrialReview) setTrialFallback(true);
      await refreshMessages();
    } catch (error) {
      Alert.alert(editing ? 'Message can no longer be edited' : 'Message was not sent', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(item: ChatMessage) {
    if (!item.body) return;
    setEditing(item);
    setMessage(item.body);
    setReview(null);
    setReviewedText('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function openIncoming(item: ChatMessage) {
    try {
      await openMessage(item.id);
      await refreshMessages();
    } catch (error) {
      Alert.alert('Message cannot be opened', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function rejectIncoming(item: ChatMessage) {
    try {
      const rejected = await rejectMessageWithoutOpening(item.id);
      if (!rejected) Alert.alert('Message could not be rejected', 'It may already have been opened or withdrawn.');
      await refreshMessages();
    } catch (error) {
      Alert.alert('Message could not be rejected', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function withdraw(item: ChatMessage) {
    try {
      const changed = await withdrawMessage(item.logical_id, relationship.id);
      if (!changed) Alert.alert('Message can no longer be withdrawn', 'At least one recipient may already have opened or rejected it. TalkTwo does not otherwise reveal read status.');
      if (editing?.logical_id === item.logical_id && changed) {
        setEditing(null);
        setMessage('');
      }
      await refreshMessages();
    } catch (error) {
      Alert.alert('Could not withdraw message', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  const otherNames = members
    .filter((member) => member.user_id !== session.user.id)
    .map((member) => memberLooks[member.user_id]?.name || member.display_name);
  const title = otherNames.length <= 2 ? otherNames.join(', ') || 'Conversation' : `${otherNames.slice(0, 2).join(', ')} +${otherNames.length - 2}`;
  const headerSubtitle = relationship.my_role === 'observer'
    ? `Observer · ${members.length} people`
    : members.length > 2
      ? `${members.length} people`
      : partnerTimezone
        ? `Timezone: ${partnerTimezone}`
        : 'Private conversation';

  if (showSettings) {
    return (
      <ChatSettingsScreen
        relationship={relationship}
        session={session}
        onBack={() => {
          setShowSettings(false);
          void refreshAppearance();
          void refreshMessages();
        }}
        onAppearanceChanged={() => void refreshAppearance()}
      />
    );
  }

  const firstProblem = !premiumAi ? freeResult.reasons[0] : null;
  const backgroundColor = BACKGROUND_THEMES[background].background;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to chats" onPress={onBack} style={styles.headerIcon}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerAvatar}><Text style={styles.headerAvatarText}>{initialsForName(title)}</Text></View>
          <View style={styles.headerText}>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.headerTitle}>{title}</Text>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.headerSubtitle}>{headerSubtitle}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Chat settings" onPress={() => setShowSettings(true)} style={styles.headerIcon}>
            <Text style={styles.settingsGlyph}>•••</Text>
          </TouchableOpacity>
        </View>

        {!premiumEntitled && plan?.plan === 'free' && canCompose ? (
          <TouchableOpacity accessibilityRole="button" onPress={() => void startTrial()} disabled={busy} style={styles.trialStrip}>
            <Text style={styles.trialText}>Try Premium AI review for 7 days</Text>
          </TouchableOpacity>
        ) : null}
        {trialFallback ? <View style={styles.infoStrip}><Text style={styles.infoText}>Daily trial AI allowance used · Free filter active</Text></View> : null}

        <View style={[styles.chatArea, { backgroundColor }]}>
          <PatternBackdrop theme={background} />
          <FlatList
            data={messages}
            keyExtractor={(item) => item.sender_id === session.user.id ? item.logical_id : item.id}
            contentContainerStyle={styles.messageContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={(
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void refreshAll().catch(() => undefined).finally(() => setRefreshing(false));
                }}
              />
            )}
            renderItem={({ item, index }) => {
              const mine = item.sender_id === session.user.id;
              const sender = memberLooks[item.sender_id] ?? { name: mine ? 'You' : 'Member', bubble: (mine ? 'sage' : 'grey') as BubbleThemeName };
              const bubble = BUBBLE_THEMES[sender.bubble];
              const textColor = textColorForBackground(bubble.background);
              const previous = index > 0 ? messages[index - 1] : null;
              const showDate = !previous || !sameDay(previous.created_at, item.created_at);
              const unopened = !mine && !item.opened_at;
              const blocked = !mine && item.blocked_for_recipient;
              const rejectedCount = mine ? item.rejected_count : 0;

              return (
                <>
                  {showDate ? <View style={styles.datePill}><Text style={styles.datePillText}>{dateLabel(item.created_at)}</Text></View> : null}
                  <View style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowTheirs]}>
                    {!mine && members.length > 2 ? <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>{initialsForName(sender.name)}</Text></View> : null}
                    <View style={[styles.bubble, { backgroundColor: bubble.background }, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                      {!mine && members.length > 2 ? <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.senderName, { color: textColor }]}>{sender.name}</Text> : null}
                      {blocked ? (
                        <>
                          <Text style={[styles.blockedTitle, { color: textColor }]}>Message unavailable</Text>
                          <Text style={[styles.messageText, { color: textColor }]}>This message cannot be read because you blocked this person. Unblock them in Chat settings to read future messages from this person.</Text>
                        </>
                      ) : unopened ? (
                        <>
                          <Text style={[styles.blockedTitle, { color: textColor }]}>{item.risk_level === 'yellow' ? 'Potentially sensitive message' : 'New message'}</Text>
                          <Text style={[styles.messageText, { color: textColor }]}>{item.risk_level === 'yellow' ? 'TalkTwo marked this as potentially conflict-escalating.' : 'The text stays hidden until you choose to open it.'}</Text>
                          <View style={styles.bubbleActions}>
                            <CompactButton title="Open" onPress={() => void openIncoming(item)} secondary />
                            {item.risk_level === 'yellow' ? <CompactButton title="Reject unread" onPress={() => void rejectIncoming(item)} secondary /> : null}
                          </View>
                        </>
                      ) : (
                        <Text selectable style={[styles.messageText, { color: textColor }]}>{item.body ?? 'Encrypted message unavailable on this device.'}</Text>
                      )}
                      <View style={styles.messageMetaRow}>
                        <Text style={[styles.messageMeta, { color: textColor }]}>
                          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {item.edited_at ? ' · edited' : ''}
                          {item.risk_level === 'yellow' ? ' · caution' : ''}
                        </Text>
                      </View>
                      {mine ? (
                        <View style={styles.senderControls}>
                          <Text style={[styles.sentStatus, { color: textColor }]}>{rejectedCount > 0 ? `${rejectedCount}${item.recipient_count > 1 ? `/${item.recipient_count}` : ''} rejected unread` : 'Sent'}</Text>
                          <View style={styles.inlineActions}>
                            {item.body ? <TouchableOpacity accessibilityRole="button" onPress={() => startEdit(item)}><Text style={[styles.inlineAction, { color: textColor }]}>Edit</Text></TouchableOpacity> : null}
                            <TouchableOpacity accessibilityRole="button" onPress={() => void withdraw(item)}><Text style={[styles.inlineAction, { color: textColor }]}>Withdraw</Text></TouchableOpacity>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </>
              );
            }}
            ListEmptyComponent={(
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatTitle}>A quieter place to talk</Text>
                <Text style={styles.emptyChatText}>{relationship.my_role === 'observer' ? 'You are a read-only observer. You will see new messages from the time you were approved.' : 'Keep messages practical: facts, requests, agreements and necessary information.'}</Text>
              </View>
            )}
          />
        </View>

        {canCompose ? (
          <View style={styles.composerWrap}>
            {editing ? (
              <View style={styles.editingStrip}>
                <Text numberOfLines={2} style={styles.editingText}>Editing a sent message. If anyone has already opened it, the server will keep the original.</Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => { setEditing(null); setMessage(''); setReview(null); setReviewedText(''); }}>
                  <Text style={styles.cancelEdit}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {premiumAi && reviewCurrent ? (
              <View style={[styles.reviewStrip, review?.level === 'red' ? styles.reviewRed : review?.level === 'yellow' ? styles.reviewYellow : styles.reviewGreen]}>
                <View style={styles.reviewTextWrap}>
                  <Text style={styles.reviewTitle}>{review?.level === 'green' ? 'Ready to send' : review?.level === 'yellow' ? 'Caution' : 'Blocked'}</Text>
                  <Text numberOfLines={3} style={styles.reviewReason}>{review?.reason}</Text>
                </View>
                {review?.rewrite ? <TouchableOpacity accessibilityRole="button" onPress={() => changeMessage(review.rewrite ?? '')}><Text style={styles.rewrite}>Use rewrite</Text></TouchableOpacity> : null}
              </View>
            ) : null}
            {!premiumAi && hasText && !freeResult.canSend && firstProblem ? (
              <View style={styles.reviewStrip}>
                <View style={styles.reviewTextWrap}>
                  <Text style={styles.reviewTitle}>{firstProblem.title}</Text>
                  <Text numberOfLines={3} style={styles.reviewReason}>{firstProblem.explanation}</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.composerRow}>
              <View style={styles.inputShell}>
                <TextInput ref={inputRef} multiline value={message} onChangeText={changeMessage} placeholder="Message" placeholderTextColor="#85857F" style={styles.input} accessibilityLabel="Message" />
                <View style={styles.counterRow}>
                  <Text style={[styles.counter, messageLength > maxLength && styles.counterDanger]}>{messageLength}/{maxLength}</Text>
                  <Text style={styles.filterLabel}>{premiumAi ? 'AI review' : 'Free filter'}</Text>
                </View>
              </View>
              {premiumAi && (!reviewCurrent || review?.level === 'red') ? (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Review message with AI" disabled={reviewBusy || busy || !hasText || messageLength > MAX_PREMIUM_LENGTH} onPress={() => void reviewWithAi()} style={[styles.sendCircle, styles.reviewCircle, (reviewBusy || busy || !hasText || messageLength > MAX_PREMIUM_LENGTH) && styles.disabled]}>
                  <Text style={styles.sendGlyph}>{reviewBusy ? '…' : '✓'}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={editing ? 'Save edited message' : 'Send message'} disabled={busy || !hasText || !canSend} onPress={() => void saveOrSend()} style={[styles.sendCircle, (busy || !hasText || !canSend) && styles.disabled]}>
                  <Text style={styles.sendGlyph}>➤</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.observerBar}><Text style={styles.observerText}>Observer · read only</Text></View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 7, backgroundColor: '#FFFFFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DADAD4' },
  headerIcon: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  back: { fontSize: 36, lineHeight: 40, color: '#173F34' },
  settingsGlyph: { fontSize: 20, color: '#36584D', letterSpacing: 1 },
  headerAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DFE8E2', flexShrink: 0 },
  headerAvatarText: { fontSize: 13, color: '#315245', fontWeight: '800' },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontWeight: '800', fontSize: 16, color: '#191919', flexShrink: 1 },
  headerSubtitle: { marginTop: 2, color: '#74746F', fontSize: 12, flexShrink: 1 },
  trialStrip: { minHeight: 38, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDF4F0', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D5E1DA' },
  trialText: { color: '#1E654F', fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  infoStrip: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#F2E9D6' },
  infoText: { color: '#695D42', textAlign: 'center', fontSize: 12, flexShrink: 1 },
  chatArea: { flex: 1, overflow: 'hidden' },
  pattern: { ...StyleSheet.absoluteFill, flexDirection: 'row', flexWrap: 'wrap', gap: 28, padding: 20, opacity: 0.16 },
  patternDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#66706A' },
  messageContent: { paddingHorizontal: 10, paddingTop: 12, paddingBottom: 16, flexGrow: 1 },
  datePill: { alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.86)', marginVertical: 8 },
  datePillText: { fontSize: 11, color: '#686863', fontWeight: '700' },
  messageRow: { width: '100%', marginVertical: 3, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowTheirs: { justifyContent: 'flex-start' },
  smallAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: '#D1D1CA' },
  smallAvatarText: { fontSize: 9, fontWeight: '800', color: '#525750' },
  bubble: { maxWidth: '82%', minWidth: 88, borderRadius: 16, paddingHorizontal: 11, paddingTop: 8, paddingBottom: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  bubbleMine: { borderBottomRightRadius: 5 },
  bubbleTheirs: { borderBottomLeftRadius: 5 },
  senderName: { fontSize: 11, fontWeight: '800', opacity: 0.74, marginBottom: 3, flexShrink: 1 },
  messageText: { fontSize: 16, lineHeight: 21, flexShrink: 1 },
  blockedTitle: { fontSize: 14, lineHeight: 19, fontWeight: '800', marginBottom: 3, flexShrink: 1 },
  bubbleActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  compactButton: { minHeight: 36, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, justifyContent: 'center', backgroundColor: '#1E5A48' },
  compactSecondary: { backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.18)' },
  compactButtonText: { fontSize: 12, color: '#FFFFFF', fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  compactSecondaryText: { color: '#242424' },
  messageMetaRow: { alignItems: 'flex-end', marginTop: 4 },
  messageMeta: { fontSize: 10, opacity: 0.58, flexShrink: 1 },
  senderControls: { marginTop: 5, paddingTop: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.10)', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sentStatus: { fontSize: 10, opacity: 0.62, flexShrink: 1 },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, flexShrink: 0 },
  inlineAction: { fontSize: 11, fontWeight: '800', textDecorationLine: 'underline' },
  emptyChat: { flex: 1, minHeight: 220, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 8 },
  emptyChatTitle: { fontSize: 18, fontWeight: '800', color: '#3F4945', textAlign: 'center' },
  emptyChatText: { color: '#6B716E', lineHeight: 20, textAlign: 'center', flexShrink: 1 },
  composerWrap: { backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingTop: 6, paddingBottom: Platform.OS === 'android' ? 8 : 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D8D8D2' },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
  inputShell: { flex: 1, minWidth: 0, borderRadius: 20, backgroundColor: '#F3F3F0', borderWidth: StyleSheet.hairlineWidth, borderColor: '#D4D4CE', paddingHorizontal: 12, paddingTop: 7, paddingBottom: 5 },
  input: { minHeight: 28, maxHeight: 112, fontSize: 16, lineHeight: 21, color: '#171717', padding: 0, textAlignVertical: 'top' },
  counterRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 3 },
  counter: { color: '#85857F', fontSize: 10 },
  counterDanger: { color: '#9C2E2E', fontWeight: '800' },
  filterLabel: { color: '#85857F', fontSize: 10, flexShrink: 1 },
  sendCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1E6A52', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  reviewCircle: { backgroundColor: '#3C5E78' },
  sendGlyph: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  disabled: { opacity: 0.35 },
  reviewStrip: { marginBottom: 6, borderRadius: 12, backgroundColor: '#F2F2EE', borderWidth: StyleSheet.hairlineWidth, borderColor: '#D4D4CE', padding: 9, flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  reviewGreen: { backgroundColor: '#EAF2EB' },
  reviewYellow: { backgroundColor: '#F4EDDA' },
  reviewRed: { backgroundColor: '#F3E5E5' },
  reviewTextWrap: { flex: 1, minWidth: 160 },
  reviewTitle: { fontSize: 12, fontWeight: '800', color: '#272727', flexShrink: 1 },
  reviewReason: { marginTop: 2, fontSize: 11, lineHeight: 15, color: '#62625D', flexShrink: 1 },
  rewrite: { fontSize: 12, fontWeight: '800', color: '#285F4D', textDecorationLine: 'underline', flexShrink: 0 },
  editingStrip: { minHeight: 34, paddingHorizontal: 4, paddingBottom: 5, flexDirection: 'row', gap: 8, alignItems: 'center' },
  editingText: { flex: 1, minWidth: 0, color: '#6D6D67', fontSize: 11, lineHeight: 15 },
  cancelEdit: { color: '#8A3737', fontWeight: '800', fontSize: 12, flexShrink: 0 },
  observerBar: { minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#F2F2EF', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D8D8D2' },
  observerText: { color: '#696963', fontWeight: '800', textAlign: 'center' },
});
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { BACKGROUND_THEMES, BUBBLE_THEMES, initialsForName, safeBackgroundTheme, safeBubbleTheme, textColorForBackground, type BackgroundThemeName, type BubbleThemeName } from '../domain/chatPresentation';
import { countMessageCharacters, evaluateFreeMessage, MAX_FREE_LENGTH } from '../filter/freeFilter';
import { getConversationTheme, listMemberPreferences } from '../services/localDb';
import { listMessages, openMessage, rejectMessageWithoutOpening, sendMessage, sendTextAttachment, type ChatMessage } from '../services/messages';
import { analyzePremiumMessage, getMyPlan, startPremiumTrial, type AiReview, type UserPlan } from '../services/premium';
import { analyzeTextAttachment, pickTextAttachment, type AttachmentReview } from '../services/textAttachments';
import { attachmentExcerpt, attachmentSizeLabel, type PreparedTextAttachment } from '../domain/textAttachments';
import { listRelationshipMembers, type RelationshipMember, type RelationshipSummary } from '../services/relationships';
import { useAppTheme, type AppColors } from '../theme/AppTheme';
import ChatSettingsScreen from './ChatSettingsScreen';
import type { PremiumSubscriptionProductKey } from '../domain/storeProducts';
import { useI18n } from '../i18n/I18nContext';
import { sentDeliveryStatusText } from '../i18n/deliveryCopy';
import type { SupportedLocale } from '../i18n/translations';
import type { TranslationKey } from '../i18n/translations';
import type { FilterReason } from '../filter/types';
import { isUiPreviewMode } from '../lib/supabase';
import { UI_PREVIEW_MEMBERS } from '../lib/uiPreviewDemo';

const MAX_PREMIUM_LENGTH = 480;

type MemberLook = { name: string; bubble: BubbleThemeName };
type ChatStyles = ReturnType<typeof makeStyles>;

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

function dateLabel(value: string, locale: SupportedLocale, todayLabel: string, yesterdayLabel: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return todayLabel;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return yesterdayLabel;
  return date.toLocaleDateString(locale === 'da' ? 'da-DK' : 'en', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function PatternBackdrop({ theme, styles, dotColor }: { theme: BackgroundThemeName; styles: ChatStyles; dotColor: string }) {
  if (BACKGROUND_THEMES[theme].pattern !== 'dots') return null;
  return (
    <View pointerEvents="none" style={styles.pattern}>
      {Array.from({ length: 54 }, (_, index) => <View key={index} style={[styles.patternDot, { backgroundColor: dotColor }]} />)}
    </View>
  );
}

function CompactButton({ title, onPress, styles, disabled = false, secondary = false }: { title: string; onPress: () => void; styles: ChatStyles; disabled?: boolean; secondary?: boolean }) {
  return (
    <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.compactButton, secondary && styles.compactSecondary, disabled && styles.disabled]}>
      <Text style={[styles.compactButtonText, secondary && styles.compactSecondaryText]}>{title}</Text>
    </TouchableOpacity>
  );
}

function localizedFilterProblem(problem: FilterReason | null | undefined, t: (key: TranslationKey, values?: Record<string, string | number>) => string) {
  if (!problem) return null;
  const keys: Partial<Record<FilterReason['code'], [TranslationKey, TranslationKey]>> = {
    too_long: ['filter.tooLongTitle', 'filter.tooLongBody'],
    exclamation_mark: ['filter.exclamationTitle', 'filter.exclamationBody'],
    emoji: ['filter.emojiTitle', 'filter.emojiBody'],
    profanity: ['filter.profanityTitle', 'filter.profanityBody'],
    generalisation: ['filter.generalisationTitle', 'filter.generalisationBody'],
    fault_reminder: ['filter.faultTitle', 'filter.faultBody'],
    criticism: ['filter.criticismTitle', 'filter.criticismBody'],
    emotion_dumping: ['filter.emotionTitle', 'filter.emotionBody'],
    caps_lock: ['filter.capsTitle', 'filter.capsBody'],
  };
  const pair = keys[problem.code];
  if (!pair) return { title: problem.title, explanation: problem.explanation };
  return { title: t(pair[0]), explanation: t(pair[1], { match: problem.matchedText ?? '' }) };
}

export default function ChatScreen({ relationship, session, onBack, onPurchasePremium, storePurchaseBusy }: {
  relationship: RelationshipSummary;
  session: Session;
  onBack: () => void;
  onPurchasePremium: (productKey: PremiumSubscriptionProductKey, relationshipId?: string | null, beneficiaryUserId?: string | null) => Promise<void>;
  storePurchaseBusy: boolean;
}) {
  const { colors } = useAppTheme();
  const { locale, t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<RelationshipMember[]>(UI_PREVIEW_MEMBERS[relationship.id] ?? []);
  const [memberLooks, setMemberLooks] = useState<Record<string, MemberLook>>({});
  const [background, setBackground] = useState<BackgroundThemeName>('paper');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [plan, setPlan] = useState<UserPlan | null>(isUiPreviewMode ? { plan: 'free', trial_ends_at: null, premium_ends_at: null, analyses_remaining_today: 0 } as UserPlan : null);
  const [review, setReview] = useState<AiReview | null>(null);
  const [reviewedText, setReviewedText] = useState('');
  const [trialFallback, setTrialFallback] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [attachment, setAttachment] = useState<PreparedTextAttachment | null>(null);
  const [attachmentReview, setAttachmentReview] = useState<AttachmentReview | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<ChatMessage | null>(null);

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
    if (isUiPreviewMode) {
      setMessages([]);
      return;
    }
    setMessages(await listMessages(relationship.id));
  }

  async function refreshPlan() {
    if (isUiPreviewMode) {
      setPlan({ plan: 'free', trial_ends_at: null, premium_ends_at: null, analyses_remaining_today: 0 } as UserPlan);
      return;
    }
    const next = await getMyPlan();
    setPlan(next);
    setTrialFallback(next.plan === 'trial' && next.analyses_remaining_today === 0);
  }

  async function refreshAppearance() {
    if (isUiPreviewMode) {
      const nextMembers = UI_PREVIEW_MEMBERS[relationship.id] ?? [];
      const looks: Record<string, MemberLook> = {};
      for (const member of nextMembers) {
        looks[member.user_id] = {
          name: member.display_name || t('chat.member'),
          bubble: safeBubbleTheme(member.user_id === session.user.id ? 'sage' : 'grey'),
        };
      }
      setMembers(nextMembers);
      setMemberLooks(looks);
      setBackground('paper');
      return;
    }
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
        name: preference?.local_alias?.trim() || member.display_name || t('chat.member'),
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
    ]);
  }

  useEffect(() => {
    setAttachment(null);
    setAttachmentReview(null);
    setViewingAttachment(null);
    setMessage('');
    setReview(null);
    setReviewedText('');
    void refreshAll().catch((error) => {
      if (isUiPreviewMode) return;
      Alert.alert(t('chat.openError'), error instanceof Error ? error.message : t('common.tryAgain'));
    });
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
    if (isUiPreviewMode) {
      Alert.alert(locale === 'da' ? 'UI-forhåndsvisning' : 'UI preview', locale === 'da' ? 'Trial kræver backend.' : 'Trial requires a backend.');
      return;
    }
    try {
      setBusy(true);
      const next = await startPremiumTrial();
      setPlan(next);
      setTrialFallback(false);
      Alert.alert(t('chat.trialStarted'), t('chat.trialStartedBody'));
    } catch (error) {
      Alert.alert(t('chat.trialError'), error instanceof Error ? error.message : t('common.tryAgain'));
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
      const text = error instanceof Error ? error.message : t('common.tryAgain');
      if (text.toLowerCase().includes('daily trial limit')) {
        setTrialFallback(true);
        setReview(null);
        setReviewedText('');
        Alert.alert(t('chat.dailyLimit'), t('chat.dailyLimitBody'));
      } else {
        Alert.alert(t('chat.aiUnavailable'), text);
      }
    } finally {
      setReviewBusy(false);
    }
  }

  async function sendCurrentMessage() {
    if (!canSend) return;
    if (isUiPreviewMode) {
      Alert.alert(locale === 'da' ? 'UI-forhåndsvisning' : 'UI preview', locale === 'da' ? 'Afsendelse kræver backend.' : 'Sending requires a backend.');
      return;
    }
    const lastTrialReview = plan?.plan === 'trial' && reviewCurrent && review?.usage?.analyses_remaining === 0;
    try {
      setBusy(true);
      await sendMessage(relationship.id, message.trim());
      setMessage('');
      setReview(null);
      setReviewedText('');
      if (lastTrialReview) setTrialFallback(true);
      await refreshMessages();
    } catch (error) {
      Alert.alert(t('chat.sendError'), error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  }

  async function chooseAttachment() {
    if (!premiumEntitled) {
      Alert.alert(t('chat.premiumAttachments'), t('chat.premiumAttachmentsBody'));
      return;
    }
    if (!premiumAi) {
      Alert.alert(t('chat.aiUnavailable'), t('chat.attachmentAiBody'));
      return;
    }
    try {
      setAttachmentBusy(true);
      const selected = await pickTextAttachment();
      if (!selected) return;
      setAttachment(selected);
      setAttachmentReview(null);
      const nextReview = await analyzeTextAttachment(relationship.id, selected);
      setAttachmentReview(nextReview);
      if (!nextReview.can_send && nextReview.usage?.plan === 'trial' && nextReview.usage.analyses_remaining === 0) {
        setTrialFallback(true);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : t('common.tryAgain');
      if (text.toLowerCase().includes('daily trial limit')) setTrialFallback(true);
      setAttachment(null);
      setAttachmentReview(null);
      Alert.alert(t('chat.documentReviewError'), text);
    } finally {
      setAttachmentBusy(false);
    }
  }

  function cancelAttachment() {
    setAttachment(null);
    setAttachmentReview(null);
  }

  async function sendAttachment() {
    if (!attachment || !attachmentReview?.can_send) return;
    const lastTrialReview = attachmentReview.usage?.plan === 'trial' && attachmentReview.usage.analyses_remaining === 0;
    try {
      setBusy(true);
      await sendTextAttachment(relationship.id, attachment);
      cancelAttachment();
      if (lastTrialReview) setTrialFallback(true);
      await refreshMessages();
    } catch (error) {
      Alert.alert(t('chat.documentSendError'), error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  }

  async function openIncoming(item: ChatMessage) {
    try {
      await openMessage(item.id);
      await refreshMessages();
    } catch (error) {
      Alert.alert(t('chat.messageOpenError'), error instanceof Error ? error.message : t('common.tryAgain'));
    }
  }

  async function rejectIncoming(item: ChatMessage) {
    try {
      const rejected = await rejectMessageWithoutOpening(item.id);
      if (!rejected) Alert.alert(t('chat.messageRejectError'), t('chat.messageRejectBody'));
      await refreshMessages();
    } catch (error) {
      Alert.alert(t('chat.messageRejectError'), error instanceof Error ? error.message : t('common.tryAgain'));
    }
  }

  const otherNames = members
    .filter((member) => member.user_id !== session.user.id)
    .map((member) => memberLooks[member.user_id]?.name || member.display_name);
  const title = otherNames.length <= 2 ? otherNames.join(', ') || t('chat.conversation') : `${otherNames.slice(0, 2).join(', ')} +${otherNames.length - 2}`;
  const headerSubtitle = relationship.my_role === 'observer'
    ? t('chat.observerPeople', { count: members.length })
    : members.length > 2
      ? t('chat.people', { count: members.length })
      : t('chat.privateConversation');

  if (viewingAttachment) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('chat.backConversation')} onPress={() => setViewingAttachment(null)} style={styles.headerIcon}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text numberOfLines={1} ellipsizeMode="middle" style={styles.headerTitle}>{viewingAttachment.attachment_name ?? t('chat.textDocument')}</Text>
            <Text style={styles.headerSubtitle}>
              {viewingAttachment.attachment_size_bytes !== null ? attachmentSizeLabel(viewingAttachment.attachment_size_bytes) : t('chat.textDocument')}
              {viewingAttachment.attachment_page_count ? ` · ${t(viewingAttachment.attachment_page_count === 1 ? 'chat.logicalPage' : 'chat.logicalPages', { count: viewingAttachment.attachment_page_count })}` : ''}
            </Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.documentViewer}>
          <Text selectable style={styles.documentText}>{viewingAttachment.body ?? t('chat.documentUnavailable')}</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (showSettings) {
    return (
      <ChatSettingsScreen
        relationship={relationship}
        session={session}
        exportMessages={messages}
        onPurchasePremium={onPurchasePremium}
        storePurchaseBusy={storePurchaseBusy}
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
  const translatedProblem = localizedFilterProblem(firstProblem, t);
  const backgroundColor = BACKGROUND_THEMES[background].background;
  const chatTextColor = textColorForBackground(backgroundColor);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('chat.backChats')} onPress={onBack} style={styles.headerIcon}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerAvatar}><Text style={styles.headerAvatarText}>{initialsForName(title)}</Text></View>
          <View style={styles.headerText}>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.headerTitle}>{title}</Text>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.headerSubtitle}>{headerSubtitle}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('chat.settings')} onPress={() => setShowSettings(true)} style={styles.headerIcon}>
            <Text style={styles.settingsGlyph}>•••</Text>
          </TouchableOpacity>
        </View>

        {!premiumEntitled && plan?.plan === 'free' && canCompose ? (
          <TouchableOpacity accessibilityRole="button" onPress={() => void startTrial()} disabled={busy} style={styles.trialStrip}>
            <Text style={styles.trialText}>{t('chat.tryTrial')}</Text>
          </TouchableOpacity>
        ) : null}
        {trialFallback ? <View style={styles.infoStrip}><Text style={styles.infoText}>{t('chat.trialFallback')}</Text></View> : null}

        <View style={[styles.chatArea, { backgroundColor }]}>
          <PatternBackdrop theme={background} styles={styles} dotColor={chatTextColor} />
          <FlatList
            data={messages}
            keyExtractor={(item) => item.sender_id === session.user.id ? item.logical_id : item.id}
            contentContainerStyle={styles.messageContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={(
              <RefreshControl
                refreshing={refreshing}
                tintColor={colors.accent}
                colors={[colors.accent]}
                onRefresh={() => {
                  setRefreshing(true);
                  void refreshAll().catch(() => undefined).finally(() => setRefreshing(false));
                }}
              />
            )}
            renderItem={({ item, index }) => {
              const mine = item.sender_id === session.user.id;
              const sender = memberLooks[item.sender_id] ?? { name: mine ? t('chat.you') : t('chat.member'), bubble: (mine ? 'sage' : 'grey') as BubbleThemeName };
              const bubble = BUBBLE_THEMES[sender.bubble];
              const textColor = textColorForBackground(bubble.background);
              const previous = index > 0 ? messages[index - 1] : null;
              const showDate = !previous || !sameDay(previous.created_at, item.created_at);
              const unopened = !mine && !item.opened_at;
              const blocked = !mine && item.blocked_for_recipient;
              const senderStatus = mine
                ? sentDeliveryStatusText(item.delivered_count ?? 0, item.recipient_count, item.rejected_count, locale)
                : '';
              const isAttachment = item.message_kind === 'text_attachment';

              return (
                <>
                  {showDate ? <View style={styles.datePill}><Text style={styles.datePillText}>{dateLabel(item.created_at, locale, t('chat.today'), t('chat.yesterday'))}</Text></View> : null}
                  <View style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowTheirs]}>
                    {!mine && members.length > 2 ? <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>{initialsForName(sender.name)}</Text></View> : null}
                    <View style={[styles.bubble, { backgroundColor: bubble.background }, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                      {!mine && members.length > 2 ? <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.senderName, { color: textColor }]}>{sender.name}</Text> : null}
                      {blocked ? (
                        <>
                          <Text style={[styles.blockedTitle, { color: textColor }]}>{t('chat.messageUnavailable')}</Text>
                          <Text style={[styles.messageText, { color: textColor }]}>{t('chat.blockedBody')}</Text>
                        </>
                      ) : unopened ? (
                        <>
                          <Text style={[styles.blockedTitle, { color: textColor }]}>{item.risk_level === 'yellow' ? t(isAttachment ? 'chat.sensitiveDocument' : 'chat.sensitiveMessage') : t(isAttachment ? 'chat.newDocument' : 'chat.newMessage')}</Text>
                          <Text style={[styles.messageText, { color: textColor }]}>{item.risk_level === 'yellow' ? t('chat.cautionBody') : t(isAttachment ? 'chat.hiddenDocument' : 'chat.hiddenText')}</Text>
                          <View style={styles.bubbleActions}>
                            <CompactButton styles={styles} title={t('chat.open')} onPress={() => void openIncoming(item)} secondary />
                            {item.risk_level === 'yellow' ? <CompactButton styles={styles} title={t('chat.rejectUnread')} onPress={() => void rejectIncoming(item)} secondary /> : null}
                          </View>
                        </>
                      ) : isAttachment ? (
                        <View style={styles.documentCard}>
                          <Text numberOfLines={2} ellipsizeMode="middle" style={[styles.documentName, { color: textColor }]}>▤ {item.attachment_name ?? t('chat.textDocument')}</Text>
                          <Text style={[styles.documentMeta, { color: textColor }]}>
                            {item.attachment_size_bytes !== null ? attachmentSizeLabel(item.attachment_size_bytes) : t('chat.plainText')}
                            {item.attachment_page_count ? ` · ${t(item.attachment_page_count === 1 ? 'chat.page' : 'chat.pages', { count: item.attachment_page_count })}` : ''}
                          </Text>
                          {item.body ? <Text numberOfLines={4} style={[styles.documentExcerpt, { color: textColor }]}>{attachmentExcerpt(item.body)}</Text> : null}
                          {item.body ? <CompactButton styles={styles} title={t('chat.viewDocument')} onPress={() => setViewingAttachment(item)} secondary /> : null}
                        </View>
                      ) : (
                        <Text selectable style={[styles.messageText, { color: textColor }]}>{item.body ?? t('chat.encryptedUnavailable')}</Text>
                      )}
                      <View style={styles.messageMetaRow}>
                        <Text style={[styles.messageMeta, { color: textColor }]}>
                          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {item.edited_at ? ` · ${t('chat.edited')}` : ''}
                          {item.risk_level === 'yellow' ? ` · ${t('chat.caution')}` : ''}
                        </Text>
                      </View>
                      {mine ? (
                        <View style={styles.senderControls}>
                          <Text accessibilityLabel={senderStatus} style={[styles.sentStatus, { color: textColor }]}>{senderStatus}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </>
              );
            }}
            ListEmptyComponent={(
              <View style={styles.emptyChat}>
                <Text style={[styles.emptyChatTitle, { color: chatTextColor }]}>{t('chat.emptyTitle')}</Text>
                <Text style={[styles.emptyChatText, { color: chatTextColor }]}>{t(relationship.my_role === 'observer' ? 'chat.observerEmpty' : 'chat.participantEmpty')}</Text>
              </View>
            )}
          />
        </View>

        {canCompose ? (
          <View style={styles.composerWrap}>
            {premiumAi && reviewCurrent ? (
              <View style={[styles.reviewStrip, review?.level === 'red' ? styles.reviewRed : review?.level === 'yellow' ? styles.reviewYellow : styles.reviewGreen]}>
                <View style={styles.reviewTextWrap}>
                  <Text style={styles.reviewTitle}>{review?.level === 'green' ? t('chat.ready') : review?.level === 'yellow' ? t('chat.caution') : t('chat.blocked')}</Text>
                  <Text numberOfLines={3} style={styles.reviewReason}>{review?.reason}</Text>
                </View>
                {review?.rewrite ? <TouchableOpacity accessibilityRole="button" style={styles.rewriteButton} onPress={() => changeMessage(review.rewrite ?? '')}><Text style={styles.rewrite}>{t('chat.useRewrite')}</Text></TouchableOpacity> : null}
              </View>
            ) : null}
            {!premiumAi && hasText && !freeResult.canSend && translatedProblem ? (
              <View style={styles.reviewStrip}>
                <View style={styles.reviewTextWrap}>
                  <Text style={styles.reviewTitle}>{translatedProblem.title}</Text>
                  <Text numberOfLines={3} style={styles.reviewReason}>{translatedProblem.explanation}</Text>
                </View>
              </View>
            ) : null}
            {attachment ? (
              <View style={styles.attachmentComposer}>
                <View style={styles.attachmentComposerText}>
                  <Text numberOfLines={2} ellipsizeMode="middle" style={styles.attachmentComposerName}>{attachment.name}</Text>
                  <Text style={styles.attachmentComposerMeta}>{attachmentSizeLabel(attachment.sizeBytes)} · {t(attachment.pageCount === 1 ? 'chat.page' : 'chat.pages', { count: attachment.pageCount })}</Text>
                  <Text style={[styles.attachmentReviewText, attachmentReview?.level === 'red' && styles.attachmentReviewDanger]}>
                    {attachmentBusy ? t('chat.reviewingDocument') : attachmentReview?.reason ?? t('chat.waitingReview')}
                  </Text>
                  {attachmentReview?.problematic_text[0] ? <Text numberOfLines={3} style={styles.attachmentProblem}>“{attachmentReview.problematic_text[0]}”</Text> : null}
                </View>
                <View style={styles.attachmentComposerActions}>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('chat.cancelAttachment')} onPress={cancelAttachment} style={styles.cancelAttachmentButton}>
                    <Text style={styles.cancelAttachmentText}>{t('chat.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('chat.sendDocument')} disabled={busy || attachmentBusy || !attachmentReview?.can_send} onPress={() => void sendAttachment()} style={[styles.sendCircle, (busy || attachmentBusy || !attachmentReview?.can_send) && styles.disabled]}>
                    <Text style={styles.sendGlyph}>➤</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.composerRow}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('chat.attachDocument')} disabled={busy || attachmentBusy} onPress={() => void chooseAttachment()} style={[styles.attachCircle, (busy || attachmentBusy) && styles.disabled]}>
                  <Text style={styles.attachGlyph}>{attachmentBusy ? '…' : '+'}</Text>
                </TouchableOpacity>
                <View style={styles.inputShell}>
                  <TextInput multiline value={message} onChangeText={changeMessage} placeholder={t('chat.message')} placeholderTextColor={colors.subtle} style={styles.input} accessibilityLabel={t('chat.message')} />
                  <View style={styles.counterRow}>
                    <Text style={[styles.counter, messageLength > maxLength && styles.counterDanger]}>{messageLength}/{maxLength}</Text>
                    <Text style={styles.filterLabel}>{premiumAi ? t('chat.aiReview') : t('chat.freeFilter')}</Text>
                  </View>
                </View>
                {premiumAi && (!reviewCurrent || review?.level === 'red') ? (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('chat.reviewMessage')} disabled={reviewBusy || busy || !hasText || messageLength > MAX_PREMIUM_LENGTH} onPress={() => void reviewWithAi()} style={[styles.sendCircle, styles.reviewCircle, (reviewBusy || busy || !hasText || messageLength > MAX_PREMIUM_LENGTH) && styles.disabled]}>
                    <Text style={styles.sendGlyph}>{reviewBusy ? '…' : '✓'}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('chat.sendMessage')} disabled={busy || !hasText || !canSend} onPress={() => void sendCurrentMessage()} style={[styles.sendCircle, (busy || !hasText || !canSend) && styles.disabled]}>
                    <Text style={styles.sendGlyph}>➤</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.observerBar}><Text style={styles.observerText}>{t('chat.observerReadOnly')}</Text></View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.surface },
    flex: { flex: 1 },
    header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 7, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    headerIcon: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    back: { fontSize: 36, lineHeight: 40, color: colors.brand },
    settingsGlyph: { fontSize: 20, color: colors.muted, letterSpacing: 1 },
    headerAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.avatar, flexShrink: 0 },
    headerAvatarText: { fontSize: 13, color: colors.avatarText, fontWeight: '800' },
    headerText: { flex: 1, minWidth: 0 },
    headerTitle: { fontWeight: '800', fontSize: 16, color: colors.text, flexShrink: 1 },
    headerSubtitle: { marginTop: 2, color: colors.subtle, fontSize: 12, flexShrink: 1 },
    trialStrip: { minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.invite, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    trialText: { color: colors.inviteText, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
    infoStrip: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.notice },
    infoText: { color: colors.noticeText, textAlign: 'center', fontSize: 12, flexShrink: 1 },
    chatArea: { flex: 1, overflow: 'hidden' },
    pattern: { ...StyleSheet.absoluteFill, flexDirection: 'row', flexWrap: 'wrap', gap: 28, padding: 20, opacity: 0.13 },
    patternDot: { width: 3, height: 3, borderRadius: 2 },
    messageContent: { paddingHorizontal: 10, paddingTop: 12, paddingBottom: 16, flexGrow: 1 },
    datePill: { alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: colors.surface, marginVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    datePillText: { fontSize: 11, color: colors.muted, fontWeight: '700' },
    messageRow: { width: '100%', marginVertical: 3, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
    messageRowMine: { justifyContent: 'flex-end' },
    messageRowTheirs: { justifyContent: 'flex-start' },
    smallAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.avatar, alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    smallAvatarText: { fontSize: 9, fontWeight: '800', color: colors.avatarText },
    bubble: { maxWidth: '82%', minWidth: 88, borderRadius: 16, paddingHorizontal: 11, paddingTop: 8, paddingBottom: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
    bubbleMine: { borderBottomRightRadius: 5 },
    bubbleTheirs: { borderBottomLeftRadius: 5 },
    senderName: { fontSize: 11, fontWeight: '800', opacity: 0.74, marginBottom: 3, flexShrink: 1 },
    messageText: { fontSize: 16, lineHeight: 21, flexShrink: 1 },
    documentCard: { gap: 6 },
    documentName: { fontSize: 15, lineHeight: 20, fontWeight: '800', flexShrink: 1 },
    documentMeta: { fontSize: 11, opacity: 0.66, flexShrink: 1 },
    documentExcerpt: { fontSize: 13, lineHeight: 18, opacity: 0.82, flexShrink: 1 },
    blockedTitle: { fontSize: 14, lineHeight: 19, fontWeight: '800', marginBottom: 3, flexShrink: 1 },
    bubbleActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    compactButton: { minHeight: 44, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, justifyContent: 'center', backgroundColor: colors.accentStrong },
    compactSecondary: { backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.18)' },
    compactButtonText: { fontSize: 12, color: colors.accentText, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
    compactSecondaryText: { color: '#242424' },
    messageMetaRow: { alignItems: 'flex-end', marginTop: 4 },
    messageMeta: { fontSize: 10, opacity: 0.58, flexShrink: 1 },
    senderControls: { marginTop: 5, paddingTop: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.10)', alignItems: 'flex-end' },
    sentStatus: { fontSize: 10, opacity: 0.62, flexShrink: 1 },
    emptyChat: { flex: 1, minHeight: 220, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 8 },
    emptyChatTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
    emptyChatText: { lineHeight: 20, textAlign: 'center', flexShrink: 1, opacity: 0.78 },
    composerWrap: { backgroundColor: colors.surface, paddingHorizontal: 8, paddingTop: 6, paddingBottom: Platform.OS === 'android' ? 8 : 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
    attachCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSoft, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    attachGlyph: { color: colors.accent, fontSize: 25, lineHeight: 28, fontWeight: '500' },
    inputShell: { flex: 1, minWidth: 0, borderRadius: 20, backgroundColor: colors.surfaceSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, paddingHorizontal: 12, paddingTop: 7, paddingBottom: 5 },
    input: { minHeight: 28, maxHeight: 112, fontSize: 16, lineHeight: 21, color: colors.text, padding: 0, textAlignVertical: 'top' },
    counterRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 3 },
    counter: { color: colors.subtle, fontSize: 10 },
    counterDanger: { color: colors.danger, fontWeight: '800' },
    filterLabel: { color: colors.subtle, fontSize: 10, flexShrink: 1 },
    sendCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentStrong, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    reviewCircle: { backgroundColor: colors.accent },
    sendGlyph: { color: colors.accentText, fontSize: 19, fontWeight: '800' },
    disabled: { opacity: 0.35 },
    reviewStrip: { marginBottom: 6, borderRadius: 12, backgroundColor: colors.surfaceSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, padding: 9, flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
    reviewGreen: { backgroundColor: colors.reviewGreen },
    reviewYellow: { backgroundColor: colors.reviewYellow },
    reviewRed: { backgroundColor: colors.reviewRed },
    reviewTextWrap: { flex: 1, minWidth: 160 },
    reviewTitle: { fontSize: 12, fontWeight: '800', color: colors.reviewText, flexShrink: 1 },
    reviewReason: { marginTop: 2, fontSize: 11, lineHeight: 15, color: colors.reviewMuted, flexShrink: 1 },
    rewriteButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
    rewrite: { fontSize: 12, fontWeight: '800', color: colors.accent, textDecorationLine: 'underline', flexShrink: 0 },
    attachmentComposer: { minHeight: 92, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSoft, padding: 10, flexDirection: 'row', gap: 10, alignItems: 'center' },
    attachmentComposerText: { flex: 1, minWidth: 0 },
    attachmentComposerName: { color: colors.text, fontWeight: '800', fontSize: 14, flexShrink: 1 },
    attachmentComposerMeta: { color: colors.subtle, fontSize: 11, marginTop: 2 },
    attachmentReviewText: { color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: 5, flexShrink: 1 },
    attachmentReviewDanger: { color: colors.danger, fontWeight: '700' },
    attachmentProblem: { color: colors.danger, fontSize: 11, lineHeight: 15, marginTop: 3, fontStyle: 'italic', flexShrink: 1 },
    attachmentComposerActions: { alignItems: 'center', gap: 7, flexShrink: 0 },
    cancelAttachmentButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
    cancelAttachmentText: { color: colors.danger, fontSize: 11, fontWeight: '800' },
    documentViewer: { padding: 18, paddingBottom: 40 },
    documentText: { color: colors.text, fontSize: 16, lineHeight: 24 },
    observerBar: { minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: colors.surfaceSoft, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    observerText: { color: colors.muted, fontWeight: '800', textAlign: 'center' },
  });
}

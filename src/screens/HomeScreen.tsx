import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { initialsForName } from '../domain/chatPresentation';
import { signOut } from '../services/auth';
import { useNativeStoreBilling } from '../hooks/useNativeStoreBilling';
import { acceptInvitation, acceptMemberInvitation, createInvitation, getMemberPaymentOffer, installMyActiveMemberKeys, listMyPendingMemberships, listRelationshipMembers, listRelationships, type PendingMembership, type RelationshipMember, type RelationshipSummary } from '../services/relationships';
import { releaseWaitingMessages } from '../services/windows';
import { useAppTheme, type AppColors, type AppearanceMode } from '../theme/AppTheme';
import ChatScreen from './ChatScreen';
import MessageWindowsScreen from './MessageWindowsScreen';
import FeedbackScreen from './FeedbackScreen';
import PremiumGiftsScreen from './PremiumGiftsScreen';
import AccountScreen from './AccountScreen';
import { createKeyRecoveryRequest, fulfillKeyRecoveryRequest, getKeyRecoveryApproval, installFulfilledKeyRecoveries } from '../services/keyRecovery';

type PendingInvite = { kind: 'invite' | 'member'; token: string };
type PendingRecovery = { token: string };

function Action({ title, onPress, styles, disabled = false, quiet = false }: { title: string; onPress: () => void; styles: ReturnType<typeof makeStyles>; disabled?: boolean; quiet?: boolean }) {
  return (
    <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, quiet && styles.quietAction, disabled && styles.disabled]}>
      <Text style={[styles.actionText, quiet && styles.quietActionText]}>{title}</Text>
    </TouchableOpacity>
  );
}

function conversationTitle(members: RelationshipMember[], me: string) {
  const others = members.filter((member) => member.user_id !== me).map((member) => member.display_name.trim() || 'Member');
  if (!others.length) return 'New conversation';
  if (others.length <= 2) return others.join(', ');
  return `${others.slice(0, 2).join(', ')} +${others.length - 2}`;
}

export default function HomeScreen({ session, pendingInvite, clearPendingInvite, pendingRecovery, clearPendingRecovery }: { session: Session; pendingInvite: PendingInvite | null; clearPendingInvite: () => void; pendingRecovery: PendingRecovery | null; clearPendingRecovery: () => void }) {
  const { colors, mode, resolved, setMode } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [relationships, setRelationships] = useState<RelationshipSummary[]>([]);
  const [members, setMembers] = useState<Record<string, RelationshipMember[]>>({});
  const [pendingMemberships, setPendingMemberships] = useState<PendingMembership[]>([]);
  const [missingSecureKeys, setMissingSecureKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<RelationshipSummary | null>(null);
  const [showWindows, setShowWindows] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showPremiumGifts, setShowPremiumGifts] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [giftRecipientEmail, setGiftRecipientEmail] = useState('');
  const storeBilling = useNativeStoreBilling(session.user.id, {
    onError: (message) => Alert.alert('Store purchase unavailable', message),
    onPurchaseVerified: async () => {
      await refreshRelationships();
      Alert.alert('Purchase verified', 'Your verified TalkTwo purchase has been processed.');
    },
    onRestoreFinished: async (count) => {
      await refreshRelationships();
      Alert.alert(
        count > 0 ? 'Purchases restored' : 'Nothing to restore',
        count > 0 ? `${count} verified purchase${count === 1 ? '' : 's'} were linked to this TalkTwo account.` : 'No verified purchases linked to this TalkTwo account were found.',
      );
    },
  });

  async function refreshRelationships() {
    await installFulfilledKeyRecoveries();
    const keyResult = await installMyActiveMemberKeys();
    const [nextRelationships, nextPending] = await Promise.all([listRelationships(), listMyPendingMemberships()]);
    const memberPairs = await Promise.all(nextRelationships.map(async (rel) => [rel.id, await listRelationshipMembers(rel.id)] as const));
    setRelationships(nextRelationships);
    setPendingMemberships(nextPending);
    setMembers(Object.fromEntries(memberPairs));
    setMissingSecureKeys(keyResult.missing);
  }

  async function requestSecureKey(relationship: RelationshipSummary) {
    try {
      setBusy(true);
      const request = await createKeyRecoveryRequest(relationship.id);
      await Share.share({ message: `Please help me recover this TalkTwo conversation on a new device. Open this link in TalkTwo and approve only after confirming with me directly: ${request.url}` });
      Alert.alert('Verify separately', `Your verification code is ${request.verificationCode}. Confirm this code with the other chat member by voice or another trusted channel.`);
    } catch (error) {
      Alert.alert('Recovery request unavailable', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function reviewKeyRecovery() {
    if (!pendingRecovery) return;
    try {
      setBusy(true);
      const request = await getKeyRecoveryApproval(pendingRecovery.token);
      Alert.alert(
        'Share conversation key?',
        `${request.requester_name} requested this chat key for a new device. Verification code: ${request.verification_code}. Approve only after confirming the request and code directly with that person.`,
        [
          { text: 'Do not approve', style: 'cancel' },
          {
            text: 'Approve secure recovery',
            onPress: () => {
              void fulfillKeyRecoveryRequest(pendingRecovery.token, request.relationship_id)
                .then(() => {
                  clearPendingRecovery();
                  Alert.alert('Key shared securely', 'Only the requesting device can open the encrypted recovery envelope.');
                })
                .catch((error) => Alert.alert('Recovery not approved', error instanceof Error ? error.message : 'Please try again.'));
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('Recovery request unavailable', error instanceof Error ? error.message : 'Ask for a new recovery link.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshRelationships().catch((error) => Alert.alert('Could not load chats', error instanceof Error ? error.message : 'Please try again.'));
  }, []);

  async function makeInvite() {
    try {
      setBusy(true);
      const invite = await createInvitation();
      await Share.share({ message: `I have invited you to a private TalkTwo conversation. ${invite.url}` });
      await refreshRelationships();
    } catch (error) {
      Alert.alert('Could not create invitation', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function acceptPendingInvite() {
    if (!pendingInvite) return;
    try {
      setBusy(true);
      if (pendingInvite.kind === 'invite') {
        await acceptInvitation(pendingInvite.token);
        clearPendingInvite();
        await refreshRelationships();
        Alert.alert('Connected', 'The private conversation and its encryption key are ready on this device.');
      } else {
        const result = await acceptMemberInvitation(pendingInvite.token);
        clearPendingInvite();
        await refreshRelationships();
        if (result.status === 'active') Alert.alert('Added', 'You can now see messages sent from this point forward.');
        else if (result.status === 'awaiting_payment') Alert.alert('Approved', 'Everyone has approved you. Your monthly membership can now be purchased. You are not charged before this point.');
        else Alert.alert('Waiting for approval', 'Everyone already in the chat must approve you before payment is available. Your encrypted conversation key is not released before access is active.');
      }
    } catch (error) {
      Alert.alert('Invitation not accepted', error instanceof Error ? error.message : 'Ask the sender for a new invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function showPaymentOffer(item: PendingMembership) {
    try {
      setBusy(true);
      const offer = await getMemberPaymentOffer(item.invitation_id);
      if (!offer.ready_to_pay) {
        Alert.alert('Not ready for payment', 'All current chat members must approve you before payment can begin.');
        return;
      }
      Alert.alert(
        `${offer.price_dkk} kr/month`,
        `${offer.role === 'observer' ? 'Read-only access' : 'Participant access with writing'} renews one month at a time. Annual prepayment is not available for extra members. Access starts only after the store purchase is verified by TalkTwo.`,
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Continue to store',
            onPress: () => {
              void storeBilling.purchaseExtraMember(item.invitation_id, offer.role)
                .catch((error) => Alert.alert('Purchase could not start', error instanceof Error ? error.message : 'Please try again.'));
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('Payment offer unavailable', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function checkWaiting() {
    try {
      setBusy(true);
      const count = await releaseWaitingMessages();
      Alert.alert(count > 0 ? 'Waiting messages released' : 'Nothing waiting', count > 0 ? `${count} message${count === 1 ? '' : 's'} can now appear in your chats.` : 'There are no messages waiting outside your current message windows.');
    } catch (error) {
      Alert.alert('Could not check waiting messages', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function buyIndividualPremium() {
    Alert.alert(
      'Individual Premium · 59 kr/month',
      'Premium covers this TalkTwo account and renews monthly. Access starts only after the App Store or Google Play purchase is verified by TalkTwo.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Continue to store',
          onPress: () => {
            void storeBilling.purchasePremium('premium_individual_monthly')
              .catch((error) => Alert.alert('Purchase could not start', error instanceof Error ? error.message : 'Please try again.'));
          },
        },
      ],
    );
  }

  function buyPremiumGift() {
    const recipient = giftRecipientEmail.trim();
    if (!recipient) {
      Alert.alert('Recipient needed', 'Enter the email address the recipient uses or will use for TalkTwo.');
      return;
    }
    Alert.alert(
      'Give one month of Premium · 59 kr',
      `The gift will be tied to ${recipient}, so the recipient does not lose it if an invitation link is misplaced. The store charge is a one-time purchase, not a subscription.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Continue to store',
          onPress: () => {
            void storeBilling.purchasePremiumGift(recipient)
              .then(() => setGiftRecipientEmail(''))
              .catch((error) => Alert.alert('Gift purchase could not start', error instanceof Error ? error.message : 'Please try again.'));
          },
        },
      ],
    );
  }

  const approvedPending = useMemo(() => pendingMemberships.find((item) => item.status === 'awaiting_payment') ?? null, [pendingMemberships]);
  const pendingText = useMemo(() => approvedPending
    ? `Your extra membership is approved. ${approvedPending.role === 'observer' ? 'Read-only access costs 29 kr/month.' : 'Writing access costs 99 kr/month.'}`
    : pendingMemberships.length ? 'A group invitation is waiting for the other chat members to approve you. No payment can happen yet.' : null, [approvedPending, pendingMemberships]);

  if (selected) return <ChatScreen relationship={selected} session={session} onBack={() => { setSelected(null); void refreshRelationships(); }} onPurchasePremium={storeBilling.purchasePremium} storePurchaseBusy={storeBilling.processing || !storeBilling.connected} />;
  if (showWindows) return <MessageWindowsScreen onBack={() => setShowWindows(false)} />;
  if (showFeedback) return <FeedbackScreen onBack={() => setShowFeedback(false)} />;
  if (showPremiumGifts) return <PremiumGiftsScreen onBack={() => setShowPremiumGifts(false)} />;
  if (showAccount) return <AccountScreen userId={session.user.id} relationshipIds={relationships.map((relationship) => relationship.id)} onBack={() => setShowAccount(false)} />;

  const appearanceOptions: AppearanceMode[] = ['system', 'light', 'dark'];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.brand}>TalkTwo</Text>
            <Text numberOfLines={1} ellipsizeMode="middle" style={styles.account}>{session.user.email}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={() => void signOut()} style={styles.headerButton}><Text style={styles.headerButtonText}>Sign out</Text></TouchableOpacity>
        </View>

        {pendingInvite ? (
          <View style={styles.invitationBanner}>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>{pendingInvite.kind === 'member' ? 'Group invitation' : 'Conversation invitation'}</Text>
              <Text style={styles.bannerHelp}>{pendingInvite.kind === 'member' ? 'Accepting only requests access. Everyone already in the chat must approve before payment is available or you can see new messages.' : 'Accept to start this private TalkTwo chat.'}</Text>
            </View>
            <Action styles={styles} title={busy ? 'Please wait…' : 'Accept'} onPress={() => void acceptPendingInvite()} disabled={busy} />
          </View>
        ) : null}

        {pendingRecovery ? (
          <View style={styles.invitationBanner}>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>Secure key recovery</Text>
              <Text style={styles.bannerHelp}>Another chat member asked this device to encrypt and share a conversation key. Verify the person and code before approving.</Text>
            </View>
            <Action styles={styles} title={busy ? 'Please wait…' : 'Review request'} onPress={() => void reviewKeyRecovery()} disabled={busy} />
          </View>
        ) : null}

        {pendingText ? <View style={styles.pendingNotice}><Text style={styles.pendingNoticeText}>{pendingText}</Text>{approvedPending ? <View style={styles.pendingAction}><Action styles={styles} title={storeBilling.processing ? 'Processing purchase…' : 'View monthly membership'} onPress={() => void showPaymentOffer(approvedPending)} disabled={busy || storeBilling.processing || !storeBilling.connected} /></View> : null}</View> : null}

        {missingSecureKeys.length ? <View style={styles.securityNotice}><Text style={styles.securityTitle}>Encryption key needed on this device</Text><Text style={styles.securityText}>Tap an affected chat to ask another current member to share its key securely. TalkTwo's server never receives the conversation key or recovery secret.</Text></View> : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Chats</Text>
          <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void makeInvite()}><Text style={styles.newChat}>New chat</Text></TouchableOpacity>
        </View>

        <View style={styles.chatList}>
          {relationships.map((rel) => {
            const relMembers = members[rel.id] ?? [];
            const title = conversationTitle(relMembers, session.user.id);
            const initials = initialsForName(title);
            const subtitle = rel.my_role === 'observer' ? `Observer · ${rel.member_count} people` : rel.member_count > 2 ? `${rel.member_count} people` : 'Private conversation';
            const keyMissing = missingSecureKeys.includes(rel.id);
            return (
              <TouchableOpacity accessibilityRole="button" key={rel.id} disabled={busy} onPress={() => keyMissing ? void requestSecureKey(rel) : setSelected(rel)} style={[styles.chatRow, busy && styles.disabled]}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
                <View style={styles.chatText}>
                  <Text numberOfLines={2} ellipsizeMode="tail" style={styles.chatTitle}>{title}</Text>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={styles.chatSubtitle}>{keyMissing ? 'Secure key unavailable on this device' : subtitle}</Text>
                </View>
                <Text style={styles.chevron}>{keyMissing ? 'Key' : '›'}</Text>
              </TouchableOpacity>
            );
          })}
          {!relationships.length ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptyText}>Start a conversation and share the private invitation link with the other person.</Text>
              <Action styles={styles} title="Start a chat" onPress={() => void makeInvite()} disabled={busy} />
            </View>
          ) : null}
        </View>

        <View style={styles.tools}>
          <Text style={styles.sectionTitle}>Premium</Text>
          <Text style={styles.toolHelp}>Individual Premium adds AI message review, longer messages, Coach and the other Premium tools to your account.</Text>
          <Action styles={styles} title={storeBilling.processing ? 'Processing purchase…' : 'Individual Premium · 59 kr/month'} onPress={buyIndividualPremium} disabled={storeBilling.processing || !storeBilling.connected} />
          <Text style={styles.privacy}>A two-person plan can be bought for you and one core chat partner from that chat's settings.</Text>
          <View style={styles.giftDivider} />
          <Text style={styles.giftTitle}>Give one month of Premium</Text>
          <Text style={styles.toolHelp}>The 59 kr one-time gift is bound to the recipient's TalkTwo email, including if they create their account later.</Text>
          <TextInput
            accessibilityLabel="Premium gift recipient email"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={!storeBilling.processing}
            keyboardType="email-address"
            onChangeText={setGiftRecipientEmail}
            placeholder="recipient@example.com"
            placeholderTextColor={colors.subtle}
            style={styles.input}
            value={giftRecipientEmail}
          />
          <Action styles={styles} title={storeBilling.processing ? 'Processing purchase…' : 'Give Premium · 59 kr once'} onPress={buyPremiumGift} disabled={storeBilling.processing || !storeBilling.connected} quiet />
          <Action styles={styles} title="Manage Premium gifts" onPress={() => setShowPremiumGifts(true)} quiet />
        </View>

        <View style={styles.tools}>
          <Text style={styles.sectionTitle}>Quiet controls</Text>
          <Text style={styles.toolHelp}>Choose when messages may appear. TalkTwo does not treat every message like a fire alarm.</Text>
          <Action styles={styles} title="Message windows" onPress={() => setShowWindows(true)} quiet />
          <Action styles={styles} title="Check waiting messages" onPress={() => void checkWaiting()} disabled={busy} quiet />
        </View>

        <View style={styles.tools}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <Text style={styles.toolHelp}>Choose light, dark, or follow your phone. Current appearance: {resolved}.</Text>
          <View style={styles.appearanceRow}>
            {appearanceOptions.map((option) => (
              <TouchableOpacity key={option} accessibilityRole="button" accessibilityState={{ selected: mode === option }} onPress={() => void setMode(option)} style={[styles.appearanceChip, mode === option && styles.appearanceChipSelected]}>
                <Text style={[styles.appearanceChipText, mode === option && styles.appearanceChipTextSelected]}>{option[0]?.toUpperCase()}{option.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.tools}>
          <Text style={styles.sectionTitle}>TalkTwo</Text>
          <Action styles={styles} title={storeBilling.processing ? 'Checking purchases…' : 'Restore purchases'} onPress={() => void storeBilling.restore().catch((error) => Alert.alert('Restore unavailable', error instanceof Error ? error.message : 'Please try again.'))} disabled={storeBilling.processing || !storeBilling.connected} quiet />
          <Action styles={styles} title="Send feedback" onPress={() => setShowFeedback(true)} quiet />
          <Action styles={styles} title="Account & privacy" onPress={() => setShowAccount(true)} quiet />
          <Text style={styles.privacy}>No profile photos. No contacts, camera, microphone or location access. Chat appearance is stored only on this device.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { paddingBottom: 42 },
    header: { minHeight: 78, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    headerText: { flex: 1, minWidth: 0 },
    brand: { fontSize: 28, fontWeight: '800', color: colors.brand, flexShrink: 1 },
    account: { marginTop: 2, color: colors.subtle, fontSize: 12, flexShrink: 1 },
    headerButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, flexShrink: 0 },
    headerButtonText: { fontWeight: '700', color: colors.muted },
    invitationBanner: { margin: 14, padding: 14, backgroundColor: colors.invite, borderRadius: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
    bannerText: { flex: 1, minWidth: 190 },
    bannerTitle: { fontWeight: '800', color: colors.inviteText, fontSize: 16, flexShrink: 1 },
    bannerHelp: { marginTop: 4, color: colors.muted, lineHeight: 18, flexShrink: 1 },
    pendingNotice: { marginHorizontal: 14, marginBottom: 8, borderRadius: 12, backgroundColor: colors.notice, padding: 12, gap: 10 },
    pendingNoticeText: { color: colors.noticeText, lineHeight: 19, flexShrink: 1 },
    pendingAction: { alignSelf: 'stretch' },
    securityNotice: { marginHorizontal: 14, marginBottom: 8, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.danger, padding: 12, gap: 5 },
    securityTitle: { color: colors.danger, fontWeight: '800', flexShrink: 1 },
    securityText: { color: colors.muted, lineHeight: 18, flexShrink: 1 },
    sectionHeader: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text, flexShrink: 1 },
    newChat: { color: colors.accent, fontWeight: '800', paddingVertical: 10 },
    chatList: { backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    chatRow: { minHeight: 72, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.avatar, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    avatarText: { color: colors.avatarText, fontWeight: '800', fontSize: 15 },
    chatText: { flex: 1, minWidth: 0 },
    chatTitle: { color: colors.text, fontWeight: '700', fontSize: 16, lineHeight: 21, flexShrink: 1 },
    chatSubtitle: { color: colors.subtle, marginTop: 3, fontSize: 13, flexShrink: 1 },
    chevron: { color: colors.subtle, fontSize: 28, lineHeight: 32, flexShrink: 0 },
    empty: { padding: 22, gap: 10, alignItems: 'stretch' },
    emptyTitle: { textAlign: 'center', fontWeight: '800', fontSize: 17, color: colors.text },
    emptyText: { textAlign: 'center', color: colors.muted, lineHeight: 20 },
    tools: { marginTop: 16, marginHorizontal: 14, backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    toolHelp: { color: colors.muted, lineHeight: 20, flexShrink: 1 },
    privacy: { color: colors.subtle, fontSize: 12, lineHeight: 17, flexShrink: 1 },
    giftDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 2 },
    giftTitle: { color: colors.text, fontWeight: '800', fontSize: 15, flexShrink: 1 },
    input: { minHeight: 46, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, color: colors.text, backgroundColor: colors.surfaceSoft },
    action: { minHeight: 44, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentStrong, flexShrink: 0 },
    quietAction: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
    actionText: { color: colors.accentText, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
    quietActionText: { color: colors.text },
    disabled: { opacity: 0.4 },
    appearanceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    appearanceChip: { minHeight: 42, minWidth: 82, flexGrow: 1, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.surfaceSoft },
    appearanceChipSelected: { backgroundColor: colors.accentStrong, borderColor: colors.accentStrong },
    appearanceChipText: { color: colors.text, fontWeight: '800' },
    appearanceChipTextSelected: { color: colors.accentText },
  });
}

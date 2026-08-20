import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { initialsForName } from '../domain/chatPresentation';
import { signOut } from '../services/auth';
import { acceptInvitation, acceptMemberInvitation, createInvitation, getMemberPaymentOffer, installMyActiveMemberKeys, listMyPendingMemberships, listRelationshipMembers, listRelationships, type PendingMembership, type RelationshipMember, type RelationshipSummary } from '../services/relationships';
import { releaseWaitingMessages } from '../services/windows';
import { useAppTheme, type AppColors, type AppearanceMode } from '../theme/AppTheme';
import ChatScreen from './ChatScreen';
import MessageWindowsScreen from './MessageWindowsScreen';
import FeedbackScreen from './FeedbackScreen';

type PendingInvite = { kind: 'invite' | 'member'; token: string };

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

export default function HomeScreen({ session, pendingInvite, clearPendingInvite }: { session: Session; pendingInvite: PendingInvite | null; clearPendingInvite: () => void }) {
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

  async function refreshRelationships() {
    const keyResult = await installMyActiveMemberKeys();
    const [nextRelationships, nextPending] = await Promise.all([listRelationships(), listMyPendingMemberships()]);
    const memberPairs = await Promise.all(nextRelationships.map(async (rel) => [rel.id, await listRelationshipMembers(rel.id)] as const));
    setRelationships(nextRelationships);
    setPendingMemberships(nextPending);
    setMembers(Object.fromEntries(memberPairs));
    setMissingSecureKeys(keyResult.missing);
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
        `${offer.role === 'observer' ? 'Read-only access' : 'Participant access with writing'} renews one month at a time. Annual prepayment is not available for extra members. Store billing is the next integration step; this development build will not charge you.`,
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

  const approvedPending = useMemo(() => pendingMemberships.find((item) => item.status === 'awaiting_payment') ?? null, [pendingMemberships]);
  const pendingText = useMemo(() => approvedPending
    ? `Your extra membership is approved. ${approvedPending.role === 'observer' ? 'Read-only access costs 29 kr/month.' : 'Writing access costs 99 kr/month.'}`
    : pendingMemberships.length ? 'A group invitation is waiting for the other chat members to approve you. No payment can happen yet.' : null, [approvedPending, pendingMemberships]);

  if (selected) return <ChatScreen relationship={selected} session={session} onBack={() => { setSelected(null); void refreshRelationships(); }} />;
  if (showWindows) return <MessageWindowsScreen onBack={() => setShowWindows(false)} />;
  if (showFeedback) return <FeedbackScreen onBack={() => setShowFeedback(false)} />;

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

        {pendingText ? <View style={styles.pendingNotice}><Text style={styles.pendingNoticeText}>{pendingText}</Text>{approvedPending ? <View style={styles.pendingAction}><Action styles={styles} title="View monthly membership" onPress={() => void showPaymentOffer(approvedPending)} disabled={busy} /></View> : null}</View> : null}

        {missingSecureKeys.length ? <View style={styles.securityNotice}><Text style={styles.securityTitle}>Encryption key needed on this device</Text><Text style={styles.securityText}>One or more chats are linked to your account, but this device no longer has the one-time secret needed to open their encrypted key envelope. TalkTwo will not ask the server to reveal the conversation key. Secure recovery sharing is being added before release.</Text></View> : null}

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
              <TouchableOpacity accessibilityRole="button" key={rel.id} disabled={keyMissing} onPress={() => setSelected(rel)} style={[styles.chatRow, keyMissing && styles.disabled]}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
                <View style={styles.chatText}>
                  <Text numberOfLines={2} ellipsizeMode="tail" style={styles.chatTitle}>{title}</Text>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={styles.chatSubtitle}>{keyMissing ? 'Secure key unavailable on this device' : subtitle}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
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
          <Action styles={styles} title="Send feedback" onPress={() => setShowFeedback(true)} quiet />
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

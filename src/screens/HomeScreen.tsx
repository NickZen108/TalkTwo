import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { initialsForName } from '../domain/chatPresentation';
import { signOut } from '../services/auth';
import { acceptInvitation, acceptMemberInvitation, createInvitation, listMyPendingMemberships, listRelationshipMembers, listRelationships, type PendingMembership, type RelationshipMember, type RelationshipSummary } from '../services/relationships';
import { releaseWaitingMessages } from '../services/windows';
import ChatScreen from './ChatScreen';
import MessageWindowsScreen from './MessageWindowsScreen';
import FeedbackScreen from './FeedbackScreen';

type PendingInvite = { kind: 'invite' | 'member'; token: string };

function Action({ title, onPress, disabled = false, quiet = false }: { title: string; onPress: () => void; disabled?: boolean; quiet?: boolean }) {
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
  const [relationships, setRelationships] = useState<RelationshipSummary[]>([]);
  const [members, setMembers] = useState<Record<string, RelationshipMember[]>>({});
  const [pendingMemberships, setPendingMemberships] = useState<PendingMembership[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<RelationshipSummary | null>(null);
  const [showWindows, setShowWindows] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  async function refreshRelationships() {
    const [nextRelationships, nextPending] = await Promise.all([listRelationships(), listMyPendingMemberships()]);
    const memberPairs = await Promise.all(nextRelationships.map(async (rel) => [rel.id, await listRelationshipMembers(rel.id)] as const));
    setRelationships(nextRelationships);
    setPendingMemberships(nextPending);
    setMembers(Object.fromEntries(memberPairs));
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
        Alert.alert('Connected', 'The private conversation is ready.');
      } else {
        const result = await acceptMemberInvitation(pendingInvite.token);
        clearPendingInvite();
        await refreshRelationships();
        if (result.status === 'active') Alert.alert('Added', 'You can now see messages sent from this point forward.');
        else if (result.status === 'awaiting_seat') Alert.alert('Waiting for a group seat', 'Everyone has approved you, but the chat needs one more paid group seat before access begins.');
        else Alert.alert('Waiting for approval', 'Everyone already in the chat must approve you before you get access. You will not receive earlier chat history.');
      }
    } catch (error) {
      Alert.alert('Invitation not accepted', error instanceof Error ? error.message : 'Ask the sender for a new invitation.');
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

  const pendingText = useMemo(() => pendingMemberships.some((item) => item.status === 'awaiting_seat')
    ? 'A group invitation is approved but waiting for an extra seat.'
    : pendingMemberships.length ? 'A group invitation is waiting for the other participants to approve you.' : null, [pendingMemberships]);

  if (selected) return <ChatScreen relationship={selected} session={session} onBack={() => { setSelected(null); void refreshRelationships(); }} />;
  if (showWindows) return <MessageWindowsScreen onBack={() => setShowWindows(false)} />;
  if (showFeedback) return <FeedbackScreen onBack={() => setShowFeedback(false)} />;

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
              <Text style={styles.bannerHelp}>{pendingInvite.kind === 'member' ? 'Accepting only requests access. Everyone already in the chat must approve before you can see new messages.' : 'Accept to start this private TalkTwo chat.'}</Text>
            </View>
            <Action title={busy ? 'Please wait…' : 'Accept'} onPress={() => void acceptPendingInvite()} disabled={busy} />
          </View>
        ) : null}

        {pendingText ? <View style={styles.pendingNotice}><Text style={styles.pendingNoticeText}>{pendingText}</Text></View> : null}

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
            return (
              <TouchableOpacity accessibilityRole="button" key={rel.id} onPress={() => setSelected(rel)} style={styles.chatRow}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
                <View style={styles.chatText}>
                  <Text numberOfLines={2} ellipsizeMode="tail" style={styles.chatTitle}>{title}</Text>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={styles.chatSubtitle}>{subtitle}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            );
          })}
          {!relationships.length ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptyText}>Start a conversation and share the private invitation link with the other person.</Text>
              <Action title="Start a chat" onPress={() => void makeInvite()} disabled={busy} />
            </View>
          ) : null}
        </View>

        <View style={styles.tools}>
          <Text style={styles.sectionTitle}>Quiet controls</Text>
          <Text style={styles.toolHelp}>Choose when messages may appear. TalkTwo does not treat every message like a fire alarm.</Text>
          <Action title="Message windows" onPress={() => setShowWindows(true)} quiet />
          <Action title="Check waiting messages" onPress={() => void checkWaiting()} disabled={busy} quiet />
        </View>

        <View style={styles.tools}>
          <Text style={styles.sectionTitle}>TalkTwo</Text>
          <Action title="Send feedback" onPress={() => setShowFeedback(true)} quiet />
          <Text style={styles.privacy}>No profile photos. No contacts, camera, microphone or location access. Chat appearance is stored only on this device.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F7F4' },
  container: { paddingBottom: 42 },
  header: { minHeight: 78, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDDDD7' },
  headerText: { flex: 1, minWidth: 0 },
  brand: { fontSize: 28, fontWeight: '800', color: '#173F34', flexShrink: 1 },
  account: { marginTop: 2, color: '#777771', fontSize: 12, flexShrink: 1 },
  headerButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, flexShrink: 0 },
  headerButtonText: { fontWeight: '700', color: '#4E5E58' },
  invitationBanner: { margin: 14, padding: 14, backgroundColor: '#E4F0E9', borderRadius: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  bannerText: { flex: 1, minWidth: 190 },
  bannerTitle: { fontWeight: '800', color: '#173F34', fontSize: 16, flexShrink: 1 },
  bannerHelp: { marginTop: 4, color: '#56615D', lineHeight: 18, flexShrink: 1 },
  pendingNotice: { marginHorizontal: 14, marginBottom: 8, borderRadius: 12, backgroundColor: '#F2E9D6', padding: 12 },
  pendingNoticeText: { color: '#665B43', lineHeight: 19, flexShrink: 1 },
  sectionHeader: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#202020', flexShrink: 1 },
  newChat: { color: '#1E6A52', fontWeight: '800', paddingVertical: 10 },
  chatList: { backgroundColor: '#FFFFFF', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#DEDED8' },
  chatRow: { minHeight: 72, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5DF' },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#DFE8E2', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { color: '#315245', fontWeight: '800', fontSize: 15 },
  chatText: { flex: 1, minWidth: 0 },
  chatTitle: { color: '#191919', fontWeight: '700', fontSize: 16, lineHeight: 21, flexShrink: 1 },
  chatSubtitle: { color: '#777771', marginTop: 3, fontSize: 13, flexShrink: 1 },
  chevron: { color: '#8A8A84', fontSize: 28, lineHeight: 32, flexShrink: 0 },
  empty: { padding: 22, gap: 10, alignItems: 'stretch' },
  emptyTitle: { textAlign: 'center', fontWeight: '800', fontSize: 17, color: '#242424' },
  emptyText: { textAlign: 'center', color: '#70706A', lineHeight: 20 },
  tools: { marginTop: 16, marginHorizontal: 14, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#DEDED8' },
  toolHelp: { color: '#70706A', lineHeight: 20, flexShrink: 1 },
  privacy: { color: '#7B7B75', fontSize: 12, lineHeight: 17, flexShrink: 1 },
  action: { minHeight: 44, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E5A48', flexShrink: 0 },
  quietAction: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D2D2CC' },
  actionText: { color: '#FFFFFF', fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  quietActionText: { color: '#292929' },
  disabled: { opacity: 0.4 },
});
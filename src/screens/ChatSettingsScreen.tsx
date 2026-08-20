import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { BACKGROUND_THEMES, BUBBLE_THEMES, initialsForName, safeBackgroundTheme, safeBubbleTheme, textColorForBackground, type BackgroundThemeName, type BubbleThemeName } from '../domain/chatPresentation';
import { getConversationTheme, listMemberPreferences, setConversationTheme, setMemberPreference } from '../services/localDb';
import { createMemberInvitation, getRelationshipSeatStatus, listPendingMemberApprovals, listRelationshipMembers, respondMemberInvitation, setMemberBlocked, type PendingApproval, type RelationshipMember, type RelationshipSummary } from '../services/relationships';
import { purchaseExtraRelationshipSeat } from '../services/purchases';

function Button({ title, onPress, secondary = false, danger = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondaryButton, danger && styles.dangerButton, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{title}</Text>
    </TouchableOpacity>
  );
}

interface LocalMemberState {
  alias: string;
  bubble: BubbleThemeName;
}

export default function ChatSettingsScreen({ relationship, session, onBack, onAppearanceChanged }: {
  relationship: RelationshipSummary;
  session: Session;
  onBack: () => void;
  onAppearanceChanged: () => void;
}) {
  const [members, setMembers] = useState<RelationshipMember[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [seatStatus, setSeatStatus] = useState<{ member_count: number; extra_seats: number; max_members: number; available_seats: number } | null>(null);
  const [background, setBackground] = useState<BackgroundThemeName>('paper');
  const [localStates, setLocalStates] = useState<Record<string, LocalMemberState>>({});
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [nextMembers, approvals, seats, savedBackground, preferences] = await Promise.all([
      listRelationshipMembers(relationship.id),
      listPendingMemberApprovals(relationship.id),
      getRelationshipSeatStatus(relationship.id),
      getConversationTheme(session.user.id, relationship.id),
      listMemberPreferences(session.user.id, relationship.id),
    ]);
    const prefMap = new Map(preferences.map((item) => [item.member_user_id, item]));
    const nextLocal: Record<string, LocalMemberState> = {};
    for (const member of nextMembers) {
      const preference = prefMap.get(member.user_id);
      nextLocal[member.user_id] = {
        alias: preference?.local_alias ?? '',
        bubble: safeBubbleTheme(preference?.bubble_theme ?? 'sage'),
      };
    }
    setMembers(nextMembers);
    setPendingApprovals(approvals);
    setSeatStatus(seats);
    setBackground(safeBackgroundTheme(savedBackground));
    setLocalStates(nextLocal);
  }

  useEffect(() => {
    void refresh().catch((error) => Alert.alert('Could not load chat settings', error instanceof Error ? error.message : 'Please try again.'));
  }, [relationship.id]);

  const memberNames = useMemo(
    () => members.filter((member) => member.user_id !== session.user.id).map((member) => localStates[member.user_id]?.alias.trim() || member.display_name),
    [members, localStates, session.user.id],
  );

  async function chooseBackground(theme: BackgroundThemeName) {
    try {
      setBackground(theme);
      await setConversationTheme(session.user.id, relationship.id, theme);
      onAppearanceChanged();
    } catch (error) {
      Alert.alert('Theme could not be saved', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function saveMemberPreference(member: RelationshipMember, next?: Partial<LocalMemberState>) {
    const current = localStates[member.user_id] ?? { alias: '', bubble: 'sage' as BubbleThemeName };
    const merged = { ...current, ...next };
    setLocalStates((existing) => ({ ...existing, [member.user_id]: merged }));
    await setMemberPreference(session.user.id, relationship.id, member.user_id, merged.alias, merged.bubble);
    onAppearanceChanged();
  }

  function confirmBlock(member: RelationshipMember) {
    const currentlyBlocked = member.blocked_by_me;
    const displayName = localStates[member.user_id]?.alias.trim() || member.display_name;
    Alert.alert(
      currentlyBlocked ? `Unblock ${displayName}?` : `Block ${displayName}?`,
      currentlyBlocked
        ? 'Future messages from this person can be read again. Messages that arrived while the person was blocked stay unreadable.'
        : 'They will not be told. Future messages from this person will appear only as blocked-message placeholders and will not be readable later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: currentlyBlocked ? 'Unblock' : 'Block',
          style: currentlyBlocked ? 'default' : 'destructive',
          onPress: () => void (async () => {
            try {
              setBusy(true);
              await setMemberBlocked(relationship.id, member.user_id, !currentlyBlocked);
              await refresh();
            } catch (error) {
              Alert.alert('Block setting could not be changed', error instanceof Error ? error.message : 'Please try again.');
            } finally {
              setBusy(false);
            }
          })(),
        },
      ],
    );
  }

  async function invite(role: 'participant' | 'observer') {
    try {
      setBusy(true);
      const invitation = await createMemberInvitation(relationship.id, role);
      await Share.share({
        message: role === 'observer'
          ? `You are invited to observe a TalkTwo conversation. Everyone already in the chat must approve you before you can see new messages. ${invitation.url}`
          : `You are invited to join a TalkTwo conversation. Everyone already in the chat must approve you before you can see new messages. ${invitation.url}`,
      });
    } catch (error) {
      Alert.alert('Invitation could not be created', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function answerApproval(item: PendingApproval, approve: boolean) {
    try {
      setBusy(true);
      const status = await respondMemberInvitation(item.invitation_id, approve);
      await refresh();
      if (status === 'awaiting_seat') Alert.alert('Approved', 'Everyone has approved. One extra group seat must now be purchased before this person gets access.');
      if (status === 'active') Alert.alert('Added', 'The new person can now see messages sent from this point forward.');
      if (status === 'rejected') Alert.alert('Not added', 'The invitation was rejected.');
    } catch (error) {
      Alert.alert('Approval could not be saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function buySeat() {
    try {
      setBusy(true);
      await purchaseExtraRelationshipSeat(relationship.id);
      await refresh();
    } catch (error) {
      Alert.alert('Purchase setup needed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to chat" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Chat settings</Text>
            <Text numberOfLines={2} ellipsizeMode="tail" style={styles.subtitle}>{memberNames.length ? memberNames.join(', ') : 'TalkTwo conversation'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Background</Text>
          <Text style={styles.help}>Only you see this. Built-in themes need no photo or file permission.</Text>
          <View style={styles.themeGrid}>
            {(Object.entries(BACKGROUND_THEMES) as Array<[BackgroundThemeName, (typeof BACKGROUND_THEMES)[BackgroundThemeName]]>).map(([key, theme]) => (
              <TouchableOpacity key={key} accessibilityRole="button" accessibilityState={{ selected: background === key }} onPress={() => void chooseBackground(key)} style={[styles.themeChip, { backgroundColor: theme.background }, background === key && styles.selectedTheme]}>
                {theme.pattern === 'dots' ? <Text style={styles.dots}>• · •</Text> : null}
                <Text style={{ color: textColorForBackground(theme.background), fontWeight: '700' }}>{theme.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>People</Text>
          <Text style={styles.help}>No profile photos. Names, aliases and bubble colours below are only for your device.</Text>
          {members.map((member) => {
            const state = localStates[member.user_id] ?? { alias: '', bubble: 'sage' as BubbleThemeName };
            const visibleName = state.alias.trim() || member.display_name;
            return (
              <View key={member.user_id} style={styles.memberCard}>
                <View style={styles.memberHeader}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{initialsForName(visibleName)}</Text></View>
                  <View style={styles.memberText}>
                    <Text numberOfLines={2} ellipsizeMode="tail" style={styles.memberName}>{visibleName}{member.user_id === session.user.id ? ' · You' : ''}</Text>
                    <Text style={styles.role}>{member.role === 'observer' ? 'Observer · read only' : 'Participant'}</Text>
                  </View>
                </View>
                <TextInput
                  value={state.alias}
                  onChangeText={(alias) => setLocalStates((existing) => ({ ...existing, [member.user_id]: { ...state, alias } }))}
                  onEndEditing={() => void saveMemberPreference(member)}
                  placeholder="Local nickname (optional)"
                  maxLength={50}
                  style={styles.aliasInput}
                />
                <Text style={styles.smallLabel}>Bubble colour</Text>
                <View style={styles.colorRow}>
                  {(Object.entries(BUBBLE_THEMES) as Array<[BubbleThemeName, (typeof BUBBLE_THEMES)[BubbleThemeName]]>).map(([key, theme]) => (
                    <TouchableOpacity key={key} accessibilityLabel={`${theme.label} bubble`} accessibilityRole="button" accessibilityState={{ selected: state.bubble === key }} onPress={() => void saveMemberPreference(member, { bubble: key })} style={[styles.colorDot, { backgroundColor: theme.background }, state.bubble === key && styles.colorSelected]} />
                  ))}
                </View>
                {member.user_id !== session.user.id ? <Button title={member.blocked_by_me ? 'Unblock person' : 'Block person'} onPress={() => confirmBlock(member)} secondary={!member.blocked_by_me} danger={member.blocked_by_me} disabled={busy} /> : null}
              </View>
            );
          })}
        </View>

        {pendingApprovals.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Needs your approval</Text>
            <Text style={styles.help}>A new person gets no old chat history. Every current member must approve before access begins.</Text>
            {pendingApprovals.map((item) => (
              <View key={item.invitation_id} style={styles.approvalCard}>
                <View style={styles.memberHeader}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{initialsForName(item.display_name)}</Text></View>
                  <View style={styles.memberText}>
                    <Text numberOfLines={2} ellipsizeMode="tail" style={styles.memberName}>{item.display_name}</Text>
                    <Text style={styles.role}>{item.role === 'observer' ? 'Observer · read only' : 'Participant'}</Text>
                  </View>
                </View>
                <View style={styles.twoButtons}>
                  <View style={styles.flex}><Button title="Reject" onPress={() => void answerApproval(item, false)} secondary disabled={busy} /></View>
                  <View style={styles.flex}><Button title="Approve" onPress={() => void answerApproval(item, true)} disabled={busy} /></View>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add another person</Text>
          <Text style={styles.help}>Two people are included. Person 3 and onward use an extra group seat. A lawyer, family counsellor or other third party can join as read-only Observer.</Text>
          {seatStatus ? <Text style={styles.seatText}>{seatStatus.member_count} of {seatStatus.max_members} seats in use · {seatStatus.available_seats} available</Text> : null}
          <Button title="Invite participant" onPress={() => void invite('participant')} disabled={busy} />
          <Button title="Invite read-only observer" onPress={() => void invite('observer')} secondary disabled={busy} />
          {seatStatus && seatStatus.available_seats === 0 && seatStatus.member_count >= 2 ? <Button title="Buy one extra seat" onPress={() => void buySeat()} secondary disabled={busy} /> : null}
          <Text style={styles.privacyNote}>Invited people receive no earlier messages. Existing participants can export older messages separately if they intentionally want to share them.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F7F4' },
  container: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 60, gap: 8 },
  backButton: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  backText: { fontSize: 36, color: '#1C1C1C', lineHeight: 40 },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 23, fontWeight: '800', color: '#171717', flexShrink: 1 },
  subtitle: { marginTop: 2, color: '#6B6B66', lineHeight: 18, flexShrink: 1 },
  section: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#DDDDD7' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#171717', flexShrink: 1 },
  help: { color: '#686863', lineHeight: 20, flexShrink: 1 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  themeChip: { minWidth: 98, minHeight: 54, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center', borderWidth: 1, borderColor: '#D7D7D0', flexGrow: 1, flexBasis: 98 },
  selectedTheme: { borderWidth: 3, borderColor: '#202020' },
  dots: { fontSize: 12, letterSpacing: 4, marginBottom: 2, color: '#7A7A74' },
  memberCard: { gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E6E6E1' },
  memberHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E2E4DF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontWeight: '800', color: '#333632', fontSize: 15 },
  memberText: { flex: 1, minWidth: 0 },
  memberName: { fontSize: 16, fontWeight: '700', color: '#191919', lineHeight: 21, flexShrink: 1 },
  role: { color: '#74746F', marginTop: 2, fontSize: 13, flexShrink: 1 },
  aliasInput: { minHeight: 44, borderWidth: 1, borderColor: '#D8D8D2', borderRadius: 12, paddingHorizontal: 12, fontSize: 16, color: '#171717' },
  smallLabel: { fontSize: 12, color: '#70706B', fontWeight: '700' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#CFCFC9' },
  colorSelected: { borderWidth: 3, borderColor: '#161616' },
  approvalCard: { gap: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E6E6E1' },
  twoButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  flex: { flex: 1, minWidth: 120 },
  button: { minHeight: 46, backgroundColor: '#1E5A48', borderRadius: 13, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryButton: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CFCFC9' },
  dangerButton: { backgroundColor: '#8A2E2E' },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  secondaryButtonText: { color: '#222222' },
  seatText: { fontWeight: '700', color: '#33332F', lineHeight: 20, flexShrink: 1 },
  privacyNote: { color: '#777771', fontSize: 12, lineHeight: 17, flexShrink: 1 },
});
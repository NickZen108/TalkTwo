import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { BACKGROUND_THEMES, BUBBLE_THEMES, initialsForName, safeBackgroundTheme, safeBubbleTheme, textColorForBackground, type BackgroundThemeName, type BubbleThemeName } from '../domain/chatPresentation';
import { getConversationTheme, listMemberPreferences, setConversationTheme, setMemberPreference } from '../services/localDb';
import { createMemberInvitation, listPendingMemberApprovals, listRelationshipMembers, respondMemberInvitation, setExtraMemberRenewalApproval, setMemberBlocked, type PendingApproval, type RelationshipMember, type RelationshipSummary } from '../services/relationships';
import { useAppTheme, type AppColors } from '../theme/AppTheme';
import type { PremiumSubscriptionProductKey } from '../domain/storeProducts';
import { MAX_PERSONAL_BOUNDARIES, MAX_PERSONAL_BOUNDARY_LENGTH, validatePersonalBoundary } from '../domain/personalBoundaries';
import { getMyPlan, type UserPlan } from '../services/premium';
import { addMyPersonalBoundary, listMyPersonalBoundaries, removeMyPersonalBoundary, type PersonalBoundaryRow } from '../services/personalBoundaries';

function hasActivePremium(plan: UserPlan | null) {
  if (!plan) return false;
  const now = Date.now();
  if (plan.plan === 'trial') return Boolean(plan.trial_ends_at && new Date(plan.trial_ends_at).getTime() > now);
  return plan.plan === 'premium' && (!plan.premium_ends_at || new Date(plan.premium_ends_at).getTime() > now);
}

function Button({ title, onPress, secondary = false, danger = false, disabled = false, styles }: { title: string; onPress: () => void; secondary?: boolean; danger?: boolean; disabled?: boolean; styles: ReturnType<typeof makeStyles> }) {
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

export default function ChatSettingsScreen({ relationship, session, onBack, onAppearanceChanged, onPurchasePremium, storePurchaseBusy }: {
  relationship: RelationshipSummary;
  session: Session;
  onBack: () => void;
  onAppearanceChanged: () => void;
  onPurchasePremium: (productKey: PremiumSubscriptionProductKey, relationshipId?: string | null, beneficiaryUserId?: string | null) => Promise<void>;
  storePurchaseBusy: boolean;
}) {
  const { colors, resolved } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [members, setMembers] = useState<RelationshipMember[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [background, setBackground] = useState<BackgroundThemeName>('paper');
  const [localStates, setLocalStates] = useState<Record<string, LocalMemberState>>({});
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<UserPlan | null>(null);
  const [boundaries, setBoundaries] = useState<PersonalBoundaryRow[]>([]);
  const [boundaryDraft, setBoundaryDraft] = useState('');

  async function refresh() {
    const [nextMembers, approvals, savedBackground, preferences, nextPlan, nextBoundaries] = await Promise.all([
      listRelationshipMembers(relationship.id),
      listPendingMemberApprovals(relationship.id),
      getConversationTheme(session.user.id, relationship.id),
      listMemberPreferences(session.user.id, relationship.id),
      getMyPlan(),
      listMyPersonalBoundaries(relationship.id),
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
    setBackground(safeBackgroundTheme(savedBackground));
    setLocalStates(nextLocal);
    setPlan(nextPlan);
    setBoundaries(nextBoundaries);
  }

  useEffect(() => {
    void refresh().catch((error) => Alert.alert('Could not load chat settings', error instanceof Error ? error.message : 'Please try again.'));
  }, [relationship.id]);

  const memberNames = useMemo(
    () => members.filter((member) => member.user_id !== session.user.id).map((member) => localStates[member.user_id]?.alias.trim() || member.display_name),
    [members, localStates, session.user.id],
  );
  const premiumPartners = useMemo(
    () => members.filter((member) => member.user_id !== session.user.id && !member.is_extra),
    [members, session.user.id],
  );
  const premiumActive = hasActivePremium(plan);
  const boundaryValidation = validatePersonalBoundary(boundaryDraft);

  async function addBoundary() {
    if (!premiumActive || !boundaryValidation.valid || busy) return;
    try {
      setBusy(true);
      await addMyPersonalBoundary(relationship.id, boundaryDraft);
      setBoundaryDraft('');
      await refresh();
    } catch (error) {
      Alert.alert('Boundary not saved', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function removeBoundary(item: PersonalBoundaryRow) {
    if (busy) return;
    try {
      setBusy(true);
      const removed = await removeMyPersonalBoundary(item.id);
      if (!removed) throw new Error('The boundary no longer exists.');
      await refresh();
    } catch (error) {
      Alert.alert('Boundary not removed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function buyTwoPersonPremium(member: RelationshipMember, productKey: 'premium_two_monthly' | 'premium_two_annual') {
    const displayName = localStates[member.user_id]?.alias.trim() || member.display_name;
    const annual = productKey === 'premium_two_annual';
    Alert.alert(
      annual ? 'Two-person Premium · 799 kr/year' : 'Two-person Premium · 99 kr/month',
      `This plan covers your TalkTwo account and ${displayName}'s account. ${annual ? 'It renews annually.' : 'It renews monthly.'} Access starts only after the store purchase is verified.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Continue to store',
          onPress: () => {
            void onPurchasePremium(productKey, relationship.id, member.user_id)
              .catch((error) => Alert.alert('Purchase could not start', error instanceof Error ? error.message : 'Please try again.'));
          },
        },
      ],
    );
  }

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

  function changeRenewalApproval(member: RelationshipMember) {
    if (member.renewal_approved_by_me === null) return;
    const displayName = localStates[member.user_id]?.alias.trim() || member.display_name;
    const approve = !member.renewal_approved_by_me;
    const period = member.current_period_end ? new Date(member.current_period_end).toLocaleDateString() : 'the end of the current paid month';
    Alert.alert(
      approve ? `Re-approve ${displayName}?` : `Stop approving ${displayName}?`,
      approve
        ? 'If every original approver approves again before the current period ends, monthly renewal can continue.'
        : `${displayName} keeps access until ${period}. Their membership will then end instead of renewing. If you need immediate distance, use Block separately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: approve ? 'Re-approve' : 'Stop renewal',
          style: approve ? 'default' : 'destructive',
          onPress: () => void (async () => {
            try {
              setBusy(true);
              const status = await setExtraMemberRenewalApproval(relationship.id, member.user_id, approve);
              await refresh();
              if (status === 'cancel_at_period_end') Alert.alert('Renewal stopped', `${displayName} remains until the paid month ends, then leaves the chat.`);
              else Alert.alert('Renewal approved', `${displayName} can continue renewing monthly while all required approvals remain in place.`);
            } catch (error) {
              Alert.alert('Approval could not be changed', error instanceof Error ? error.message : 'Please try again.');
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
      const price = role === 'observer' ? 29 : 99;
      await Share.share({
        message: role === 'observer'
          ? `You are invited to observe a TalkTwo conversation for ${price} kr/month. Everyone already in the chat must approve you before payment is available or you can see new messages. ${invitation.url}`
          : `You are invited to join a TalkTwo conversation for ${price} kr/month with writing access. Everyone already in the chat must approve you before payment is available or you can see new messages. ${invitation.url}`,
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
      if (status === 'awaiting_payment') {
        const price = item.role === 'observer' ? 29 : 99;
        Alert.alert('Approved', `Everyone has approved. ${item.display_name} can now start a ${price} kr monthly membership. No payment was possible before this approval.`);
      }
      if (status === 'active') Alert.alert('Added', 'The new person can now see messages sent from this point forward.');
      if (status === 'rejected') Alert.alert('Not added', 'The invitation was rejected.');
    } catch (error) {
      Alert.alert('Approval could not be saved', error instanceof Error ? error.message : 'Please try again.');
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

        {premiumPartners.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Premium for two</Text>
            <Text style={styles.help}>One subscription can cover you and one core chat partner. The selected person is fixed to the verified subscription; changing person or tier requires a new checkout.</Text>
            {premiumPartners.map((member) => {
              const displayName = localStates[member.user_id]?.alias.trim() || member.display_name;
              return (
                <View key={member.user_id} style={styles.memberCard}>
                  <Text numberOfLines={2} ellipsizeMode="tail" style={styles.memberName}>Premium with {displayName}</Text>
                  <Button styles={styles} title="99 kr/month" onPress={() => buyTwoPersonPremium(member, 'premium_two_monthly')} disabled={busy || storePurchaseBusy} />
                  <Button styles={styles} title="799 kr/year" onPress={() => buyTwoPersonPremium(member, 'premium_two_annual')} secondary disabled={busy || storePurchaseBusy} />
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Boundaries · Premium</Text>
          <Text style={styles.help}>Add up to {MAX_PERSONAL_BOUNDARIES} words or short phrases you do not want in messages in this chat. TalkTwo checks complete words, ignores capitalisation and punctuation, and tells the sender exactly which boundary stopped the message.</Text>
          <Text style={styles.help}>Essential logistics words such as child, school, doctor or emergency cannot be blocked on their own. Boundaries are enforced only while your Premium or trial access is active.</Text>
          {!premiumActive ? <Text accessibilityLiveRegion="polite" style={styles.premiumNote}>Premium or an active trial is required to add boundaries. Existing entries remain visible and can be removed.</Text> : null}
          <Text style={styles.smallLabel}>Blocked word or phrase · {boundaries.length}/{MAX_PERSONAL_BOUNDARIES}</Text>
          <TextInput
            accessibilityLabel="New personal boundary for this chat"
            autoCapitalize="none"
            autoCorrect={false}
            editable={premiumActive && !busy && boundaries.length < MAX_PERSONAL_BOUNDARIES}
            maxLength={MAX_PERSONAL_BOUNDARY_LENGTH}
            onChangeText={setBoundaryDraft}
            onSubmitEditing={() => void addBoundary()}
            placeholder="Example: you never care"
            placeholderTextColor={colors.subtle}
            returnKeyType="done"
            style={styles.aliasInput}
            value={boundaryDraft}
          />
          {boundaryDraft && !boundaryValidation.valid ? <Text accessibilityLiveRegion="polite" style={styles.inputError}>{boundaryValidation.error}</Text> : null}
          <Button styles={styles} title={busy ? 'Saving…' : 'Add boundary'} onPress={() => void addBoundary()} disabled={!premiumActive || !boundaryValidation.valid || busy || boundaries.length >= MAX_PERSONAL_BOUNDARIES} />
          {boundaries.map((item) => (
            <View key={item.id} style={styles.boundaryRow}>
              <Text style={styles.boundaryPhrase}>{item.phrase}</Text>
              <TouchableOpacity accessibilityLabel={`Remove boundary ${item.phrase}`} accessibilityRole="button" disabled={busy} onPress={() => void removeBoundary(item)} style={styles.removeButton}>
                <Text style={styles.removeButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Background</Text>
          <Text style={styles.help}>Only you see this. App dark mode is currently {resolved}; conversation backgrounds stay a separate local choice.</Text>
          <View style={styles.themeGrid}>
            {(Object.entries(BACKGROUND_THEMES) as Array<[BackgroundThemeName, (typeof BACKGROUND_THEMES)[BackgroundThemeName]]>).map(([key, theme]) => (
              <TouchableOpacity key={key} accessibilityRole="button" accessibilityState={{ selected: background === key }} onPress={() => void chooseBackground(key)} style={[styles.themeChip, { backgroundColor: theme.background }, background === key && styles.selectedTheme]}>
                {theme.pattern === 'dots' ? <Text style={[styles.dots, { color: textColorForBackground(theme.background) }]}>• · •</Text> : null}
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
                    {member.is_extra ? <Text style={styles.subscription}>{member.role === 'observer' ? '29 kr/month' : '99 kr/month'}{member.current_period_end ? ` · paid through ${new Date(member.current_period_end).toLocaleDateString()}` : ''}{member.subscription_status === 'cancel_at_period_end' ? ' · renewal stopping' : ''}</Text> : null}
                  </View>
                </View>
                <TextInput
                  value={state.alias}
                  onChangeText={(alias) => setLocalStates((existing) => ({ ...existing, [member.user_id]: { ...state, alias } }))}
                  onEndEditing={() => void saveMemberPreference(member)}
                  placeholder="Local nickname (optional)"
                  placeholderTextColor={colors.subtle}
                  maxLength={50}
                  style={styles.aliasInput}
                />
                <Text style={styles.smallLabel}>Bubble colour</Text>
                <View style={styles.colorRow}>
                  {(Object.entries(BUBBLE_THEMES) as Array<[BubbleThemeName, (typeof BUBBLE_THEMES)[BubbleThemeName]]>).map(([key, theme]) => (
                    <TouchableOpacity key={key} accessibilityLabel={`${theme.label} bubble`} accessibilityRole="button" accessibilityState={{ selected: state.bubble === key }} onPress={() => void saveMemberPreference(member, { bubble: key })} style={[styles.colorDot, { backgroundColor: theme.background }, state.bubble === key && styles.colorSelected]} />
                  ))}
                </View>
                {member.user_id !== session.user.id ? <Button styles={styles} title={member.blocked_by_me ? 'Unblock person' : 'Block person'} onPress={() => confirmBlock(member)} secondary={!member.blocked_by_me} danger={member.blocked_by_me} disabled={busy} /> : null}
                {member.user_id !== session.user.id && member.is_extra && member.renewal_approved_by_me !== null ? <Button styles={styles} title={member.renewal_approved_by_me ? 'Stop my renewal approval' : 'Re-approve monthly renewal'} onPress={() => changeRenewalApproval(member)} secondary={member.renewal_approved_by_me} disabled={busy} /> : null}
              </View>
            );
          })}
        </View>

        {pendingApprovals.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Needs your approval</Text>
            <Text style={styles.help}>A new person gets no old chat history. Every current member must approve first. Only then is monthly payment made available to the invited person.</Text>
            {pendingApprovals.map((item) => (
              <View key={item.invitation_id} style={styles.approvalCard}>
                <View style={styles.memberHeader}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{initialsForName(item.display_name)}</Text></View>
                  <View style={styles.memberText}>
                    <Text numberOfLines={2} ellipsizeMode="tail" style={styles.memberName}>{item.display_name}</Text>
                    <Text style={styles.role}>{item.role === 'observer' ? 'Observer · 29 kr/month · read only' : 'Participant · 99 kr/month · can write'}</Text>
                  </View>
                </View>
                <View style={styles.twoButtons}>
                  <View style={styles.flex}><Button styles={styles} title="Reject" onPress={() => void answerApproval(item, false)} secondary disabled={busy} /></View>
                  <View style={styles.flex}><Button styles={styles} title="Approve" onPress={() => void answerApproval(item, true)} disabled={busy} /></View>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add another person</Text>
          <Text style={styles.help}>The first two people are the core chat. Person 3 and onward pays for their own access only after every current member has approved them.</Text>
          <Button styles={styles} title="Invite participant · 99 kr/month" onPress={() => void invite('participant')} disabled={busy} />
          <Button styles={styles} title="Invite read-only observer · 29 kr/month" onPress={() => void invite('observer')} secondary disabled={busy} />
          <Text style={styles.privacyNote}>Extra memberships renew one month at a time. Annual prepayment is not offered. Invited people receive no earlier messages. Existing participants can export older messages separately if they intentionally want to share them.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 14 },
    header: { flexDirection: 'row', alignItems: 'center', minHeight: 60, gap: 8 },
    backButton: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    backText: { fontSize: 36, color: colors.brand, lineHeight: 40 },
    headerText: { flex: 1, minWidth: 0 },
    title: { fontSize: 23, fontWeight: '800', color: colors.text, flexShrink: 1 },
    subtitle: { marginTop: 2, color: colors.muted, lineHeight: 18, flexShrink: 1 },
    section: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text, flexShrink: 1 },
    help: { color: colors.muted, lineHeight: 20, flexShrink: 1 },
    premiumNote: { color: colors.noticeText, backgroundColor: colors.notice, borderRadius: 10, padding: 10, lineHeight: 19, flexShrink: 1 },
    inputError: { color: colors.danger, lineHeight: 18, fontSize: 13, flexShrink: 1 },
    boundaryRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8 },
    boundaryPhrase: { flex: 1, minWidth: 0, color: colors.text, fontWeight: '700', lineHeight: 20 },
    removeButton: { minHeight: 44, minWidth: 72, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
    removeButtonText: { color: colors.danger, fontWeight: '800' },
    themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    themeChip: { minWidth: 98, minHeight: 54, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, flexGrow: 1, flexBasis: 98 },
    selectedTheme: { borderWidth: 3, borderColor: colors.accent },
    dots: { fontSize: 12, letterSpacing: 4, marginBottom: 2 },
    memberCard: { gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    memberHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.avatar, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    avatarText: { fontWeight: '800', color: colors.avatarText, fontSize: 15 },
    memberText: { flex: 1, minWidth: 0 },
    memberName: { fontSize: 16, fontWeight: '700', color: colors.text, lineHeight: 21, flexShrink: 1 },
    role: { color: colors.muted, marginTop: 2, fontSize: 13, flexShrink: 1 },
    subscription: { color: colors.subtle, marginTop: 3, fontSize: 12, lineHeight: 17, flexShrink: 1 },
    aliasInput: { minHeight: 44, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, color: colors.text, backgroundColor: colors.input },
    smallLabel: { fontSize: 12, color: colors.muted, fontWeight: '700' },
    colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.borderStrong },
    colorSelected: { borderWidth: 3, borderColor: colors.accent },
    approvalCard: { gap: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    twoButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    flex: { flex: 1, minWidth: 120 },
    button: { minHeight: 46, backgroundColor: colors.accentStrong, borderRadius: 13, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
    dangerButton: { backgroundColor: colors.danger },
    disabled: { opacity: 0.4 },
    buttonText: { color: colors.accentText, fontSize: 15, lineHeight: 20, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
    secondaryButtonText: { color: colors.text },
    privacyNote: { color: colors.subtle, fontSize: 12, lineHeight: 17, flexShrink: 1 },
  });
}

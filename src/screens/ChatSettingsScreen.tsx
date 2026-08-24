import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { BACKGROUND_THEMES, BUBBLE_THEMES, initialsForName, safeBackgroundTheme, safeBubbleTheme, textColorForBackground, type BackgroundThemeName, type BubbleThemeName } from '../domain/chatPresentation';
import { exportableMessages, validateExportDateRange } from '../domain/conversationExport';
import { getConversationTheme, listMemberPreferences, setConversationTheme, setMemberPreference } from '../services/localDb';
import { createMemberInvitation, listPendingMemberApprovals, listRelationshipMembers, respondMemberInvitation, setExtraMemberRenewalApproval, setMemberBlocked, type PendingApproval, type RelationshipMember, type RelationshipSummary } from '../services/relationships';
import { useAppTheme, type AppColors } from '../theme/AppTheme';
import type { PremiumSubscriptionProductKey } from '../domain/storeProducts';
import { MAX_PERSONAL_BOUNDARIES, MAX_PERSONAL_BOUNDARY_LENGTH, validatePersonalBoundary } from '../domain/personalBoundaries';
import { getMyPlan, type UserPlan } from '../services/premium';
import { addMyPersonalBoundary, listMyPersonalBoundaries, removeMyPersonalBoundary, type PersonalBoundaryRow } from '../services/personalBoundaries';
import { shareConversationPdf } from '../services/conversationExport';
import type { ChatMessage } from '../services/messages';
import { useI18n } from '../i18n/I18nContext';
import { getConversationExportCopy } from '../i18n/exportCopy';
import type { TranslationKey } from '../i18n/translations';

const BACKGROUND_THEME_KEYS: Record<BackgroundThemeName, TranslationKey> = {
  paper: 'settings.themePaper', sage: 'settings.themeSage', sand: 'settings.themeSand',
  sky: 'settings.themeSky', dots: 'settings.themeDots', night: 'settings.themeNight',
};

const BUBBLE_THEME_KEYS: Record<BubbleThemeName, TranslationKey> = {
  sage: 'settings.themeSage', blue: 'settings.themeBlue', sand: 'settings.themeSand',
  lilac: 'settings.themeLilac', grey: 'settings.themeGrey', mint: 'settings.themeMint',
};

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

export default function ChatSettingsScreen({ relationship, session, exportMessages, onBack, onAppearanceChanged, onPurchasePremium, storePurchaseBusy }: {
  relationship: RelationshipSummary;
  session: Session;
  exportMessages: ChatMessage[];
  onBack: () => void;
  onAppearanceChanged: () => void;
  onPurchasePremium: (productKey: PremiumSubscriptionProductKey, relationshipId?: string | null, beneficiaryUserId?: string | null) => Promise<void>;
  storePurchaseBusy: boolean;
}) {
  const { colors, resolved } = useAppTheme();
  const { locale, t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const exportCopy = useMemo(() => getConversationExportCopy(locale), [locale]);
  const [members, setMembers] = useState<RelationshipMember[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [background, setBackground] = useState<BackgroundThemeName>('paper');
  const [localStates, setLocalStates] = useState<Record<string, LocalMemberState>>({});
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<UserPlan | null>(null);
  const [boundaries, setBoundaries] = useState<PersonalBoundaryRow[]>([]);
  const [boundaryDraft, setBoundaryDraft] = useState('');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

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
    void refresh().catch((error) => Alert.alert(t('settings.loadError'), error instanceof Error ? error.message : t('common.tryAgain')));
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
  const boundaryError = boundaryValidation.valid ? null
    : boundaryValidation.error === 'Enter a word or short phrase.' ? t('settings.boundaryEmpty')
      : boundaryValidation.error === `Use at most ${MAX_PERSONAL_BOUNDARY_LENGTH} characters.` ? t('settings.boundaryMaxChars', { count: MAX_PERSONAL_BOUNDARY_LENGTH })
        : boundaryValidation.error === 'Use at least two letters or numbers.' ? t('settings.boundaryMin')
          : boundaryValidation.error === 'Use at most five words.' ? t('settings.boundaryMaxWords')
            : t('settings.boundaryEssential');
  const exportRangeValidation = validateExportDateRange(exportStartDate, exportEndDate);
  const exportRangeError = exportRangeValidation.valid ? null
    : exportRangeValidation.error === 'invalid_start' ? exportCopy.invalidStart
      : exportRangeValidation.error === 'invalid_end' ? exportCopy.invalidEnd
        : exportCopy.reversedRange;

  async function addBoundary() {
    if (!premiumActive || !boundaryValidation.valid || busy) return;
    try {
      setBusy(true);
      await addMyPersonalBoundary(relationship.id, boundaryDraft);
      setBoundaryDraft('');
      await refresh();
    } catch (error) {
      Alert.alert(t('settings.boundarySaveError'), error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  }

  async function removeBoundary(item: PersonalBoundaryRow) {
    if (busy) return;
    try {
      setBusy(true);
      const removed = await removeMyPersonalBoundary(item.id);
      if (!removed) throw new Error(t('settings.boundaryMissing'));
      await refresh();
    } catch (error) {
      Alert.alert(t('settings.boundaryRemoveError'), error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  }

  function confirmExport() {
    if (!premiumActive || busy || !exportRangeValidation.valid) return;
    const range = exportRangeValidation.range;
    const exportableCount = exportableMessages(exportMessages, range).length;
    Alert.alert(
      exportCopy.confirmTitle,
      exportCopy.confirmBody(exportableCount),
      [
        { text: t('chat.cancel'), style: 'cancel' },
        {
          text: exportCopy.create,
          onPress: () => void (async () => {
            try {
              setBusy(true);
              const title = memberNames.length ? memberNames.join(', ') : exportCopy.fallbackTitle;
              await shareConversationPdf(
                title,
                members.map((member) => ({ id: member.user_id, name: localStates[member.user_id]?.alias.trim() || member.display_name })),
                exportMessages,
                locale === 'da' ? 'da-DK' : 'en',
                range,
              );
            } catch (error) {
              Alert.alert(exportCopy.failed, error instanceof Error ? error.message : t('common.tryAgain'));
            } finally {
              setBusy(false);
            }
          })(),
        },
      ],
    );
  }

  function buyTwoPersonPremium(member: RelationshipMember, productKey: 'premium_two_monthly' | 'premium_two_annual') {
    const displayName = localStates[member.user_id]?.alias.trim() || member.display_name;
    const annual = productKey === 'premium_two_annual';
    Alert.alert(
      t(annual ? 'settings.twoAnnualTitle' : 'settings.twoMonthlyTitle'),
      t('settings.twoPlanBody', { name: displayName, renewal: t(annual ? 'settings.renewsAnnually' : 'settings.renewsMonthly') }),
      [
        { text: t('home.notNow'), style: 'cancel' },
        {
          text: t('home.continueStore'),
          onPress: () => {
            void onPurchasePremium(productKey, relationship.id, member.user_id)
              .catch((error) => Alert.alert(t('home.purchaseStartError'), error instanceof Error ? error.message : t('common.tryAgain')));
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
      Alert.alert(t('settings.themeError'), error instanceof Error ? error.message : t('common.tryAgain'));
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
      t(currentlyBlocked ? 'settings.unblockTitle' : 'settings.blockTitle', { name: displayName }),
      t(currentlyBlocked ? 'settings.unblockBody' : 'settings.blockBody'),
      [
        { text: t('chat.cancel'), style: 'cancel' },
        {
          text: t(currentlyBlocked ? 'settings.unblock' : 'settings.block'),
          style: currentlyBlocked ? 'default' : 'destructive',
          onPress: () => void (async () => {
            try {
              setBusy(true);
              await setMemberBlocked(relationship.id, member.user_id, !currentlyBlocked);
              await refresh();
            } catch (error) {
              Alert.alert(t('settings.blockError'), error instanceof Error ? error.message : t('common.tryAgain'));
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
    const period = member.current_period_end ? new Date(member.current_period_end).toLocaleDateString(locale === 'da' ? 'da-DK' : 'en') : t('settings.periodFallback');
    Alert.alert(
      t(approve ? 'settings.reapproveTitle' : 'settings.stopApprovalTitle', { name: displayName }),
      approve ? t('settings.reapproveBody') : t('settings.stopApprovalBody', { name: displayName, period }),
      [
        { text: t('chat.cancel'), style: 'cancel' },
        {
          text: t(approve ? 'settings.reapprove' : 'settings.stopRenewal'),
          style: approve ? 'default' : 'destructive',
          onPress: () => void (async () => {
            try {
              setBusy(true);
              const status = await setExtraMemberRenewalApproval(relationship.id, member.user_id, approve);
              await refresh();
              if (status === 'cancel_at_period_end') Alert.alert(t('settings.renewalStopped'), t('settings.renewalStoppedBody', { name: displayName }));
              else Alert.alert(t('settings.renewalApproved'), t('settings.renewalApprovedBody', { name: displayName }));
            } catch (error) {
              Alert.alert(t('settings.approvalChangeError'), error instanceof Error ? error.message : t('common.tryAgain'));
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
        message: t(role === 'observer' ? 'settings.observerInviteShare' : 'settings.participantInviteShare', { price, url: invitation.url }),
      });
    } catch (error) {
      Alert.alert(t('settings.inviteError'), error instanceof Error ? error.message : t('common.tryAgain'));
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
        Alert.alert(t('home.approved'), t('settings.everyoneApproved', { name: item.display_name, price }));
      }
      if (status === 'active') Alert.alert(t('home.added'), t('home.addedBody'));
      if (status === 'rejected') Alert.alert(t('settings.notAdded'), t('settings.inviteRejected'));
    } catch (error) {
      Alert.alert(t('settings.approvalSaveError'), error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('settings.back')} onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('settings.title')}</Text>
            <Text numberOfLines={2} ellipsizeMode="tail" style={styles.subtitle}>{memberNames.length ? memberNames.join(', ') : t('settings.conversation')}</Text>
          </View>
        </View>

        {premiumPartners.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.premiumTwo')}</Text>
            <Text style={styles.help}>{t('settings.premiumTwoHelp')}</Text>
            {premiumPartners.map((member) => {
              const displayName = localStates[member.user_id]?.alias.trim() || member.display_name;
              return (
                <View key={member.user_id} style={styles.memberCard}>
                  <Text numberOfLines={2} ellipsizeMode="tail" style={styles.memberName}>{t('settings.premiumWith', { name: displayName })}</Text>
                  <Button styles={styles} title={t('settings.monthlyAction')} onPress={() => buyTwoPersonPremium(member, 'premium_two_monthly')} disabled={busy || storePurchaseBusy} />
                  <Button styles={styles} title={t('settings.annualAction')} onPress={() => buyTwoPersonPremium(member, 'premium_two_annual')} secondary disabled={busy || storePurchaseBusy} />
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.boundariesTitle')}</Text>
          <Text style={styles.help}>{t('settings.boundariesHelp1', { count: MAX_PERSONAL_BOUNDARIES })}</Text>
          <Text style={styles.help}>{t('settings.boundariesHelp2')}</Text>
          {!premiumActive ? <Text accessibilityLiveRegion="polite" style={styles.premiumNote}>{t('settings.boundariesPremium')}</Text> : null}
          <Text style={styles.smallLabel}>{t('settings.boundaryCount', { current: boundaries.length, maximum: MAX_PERSONAL_BOUNDARIES })}</Text>
          <TextInput
            accessibilityLabel={t('settings.boundaryLabel')}
            autoCapitalize="none"
            autoCorrect={false}
            editable={premiumActive && !busy && boundaries.length < MAX_PERSONAL_BOUNDARIES}
            maxLength={MAX_PERSONAL_BOUNDARY_LENGTH}
            onChangeText={setBoundaryDraft}
            onSubmitEditing={() => void addBoundary()}
            placeholder={t('settings.boundaryExample')}
            placeholderTextColor={colors.subtle}
            returnKeyType="done"
            style={styles.aliasInput}
            value={boundaryDraft}
          />
          {boundaryDraft && !boundaryValidation.valid ? <Text accessibilityLiveRegion="polite" style={styles.inputError}>{boundaryError}</Text> : null}
          <Button styles={styles} title={busy ? t('settings.saving') : t('settings.addBoundary')} onPress={() => void addBoundary()} disabled={!premiumActive || !boundaryValidation.valid || busy || boundaries.length >= MAX_PERSONAL_BOUNDARIES} />
          {boundaries.map((item) => (
            <View key={item.id} style={styles.boundaryRow}>
              <Text style={styles.boundaryPhrase}>{item.phrase}</Text>
              <TouchableOpacity accessibilityLabel={t('settings.removeBoundaryLabel', { phrase: item.phrase })} accessibilityRole="button" disabled={busy} onPress={() => void removeBoundary(item)} style={styles.removeButton}>
                <Text style={styles.removeButtonText}>{t('settings.remove')}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.background')}</Text>
          <Text style={styles.help}>{t('settings.backgroundHelp', { appearance: t(resolved === 'dark' ? 'home.appearanceDark' : 'home.appearanceLight') })}</Text>
          <View style={styles.themeGrid}>
            {(Object.entries(BACKGROUND_THEMES) as Array<[BackgroundThemeName, (typeof BACKGROUND_THEMES)[BackgroundThemeName]]>).map(([key, theme]) => (
              <TouchableOpacity key={key} accessibilityRole="button" accessibilityState={{ selected: background === key }} onPress={() => void chooseBackground(key)} style={[styles.themeChip, { backgroundColor: theme.background }, background === key && styles.selectedTheme]}>
                {theme.pattern === 'dots' ? <Text style={[styles.dots, { color: textColorForBackground(theme.background) }]}>• · •</Text> : null}
                <Text style={{ color: textColorForBackground(theme.background), fontWeight: '700' }}>{t(BACKGROUND_THEME_KEYS[key])}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.people')}</Text>
          <Text style={styles.help}>{t('settings.peopleHelp')}</Text>
          {members.map((member) => {
            const state = localStates[member.user_id] ?? { alias: '', bubble: 'sage' as BubbleThemeName };
            const visibleName = state.alias.trim() || member.display_name;
            return (
              <View key={member.user_id} style={styles.memberCard}>
                <View style={styles.memberHeader}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{initialsForName(visibleName)}</Text></View>
                  <View style={styles.memberText}>
                    <Text numberOfLines={2} ellipsizeMode="tail" style={styles.memberName}>{visibleName}{member.user_id === session.user.id ? ` · ${t('settings.you')}` : ''}</Text>
                    <Text style={styles.role}>{member.role === 'observer' ? t('chat.observerReadOnly') : t('settings.participant')}</Text>
                    {member.is_extra ? <Text style={styles.subscription}>{t(member.role === 'observer' ? 'settings.monthlyObserver' : 'settings.monthlyParticipant')}{member.current_period_end ? ` · ${t('settings.paidThrough', { date: new Date(member.current_period_end).toLocaleDateString(locale === 'da' ? 'da-DK' : 'en') })}` : ''}{member.subscription_status === 'cancel_at_period_end' ? ` · ${t('settings.renewalStopping')}` : ''}</Text> : null}
                  </View>
                </View>
                <TextInput
                  value={state.alias}
                  onChangeText={(alias) => setLocalStates((existing) => ({ ...existing, [member.user_id]: { ...state, alias } }))}
                  onEndEditing={() => void saveMemberPreference(member)}
                  placeholder={t('settings.nickname')}
                  placeholderTextColor={colors.subtle}
                  maxLength={50}
                  style={styles.aliasInput}
                />
                <Text style={styles.smallLabel}>{t('settings.bubbleColour')}</Text>
                <View style={styles.colorRow}>
                  {(Object.entries(BUBBLE_THEMES) as Array<[BubbleThemeName, (typeof BUBBLE_THEMES)[BubbleThemeName]]>).map(([key, theme]) => (
                    <TouchableOpacity key={key} accessibilityLabel={t('settings.bubbleLabel', { theme: t(BUBBLE_THEME_KEYS[key]) })} accessibilityRole="button" accessibilityState={{ selected: state.bubble === key }} onPress={() => void saveMemberPreference(member, { bubble: key })} style={[styles.colorDot, { backgroundColor: theme.background }, state.bubble === key && styles.colorSelected]} />
                  ))}
                </View>
                {member.user_id !== session.user.id ? <Button styles={styles} title={t(member.blocked_by_me ? 'settings.unblockPerson' : 'settings.blockPerson')} onPress={() => confirmBlock(member)} secondary={!member.blocked_by_me} danger={member.blocked_by_me} disabled={busy} /> : null}
                {member.user_id !== session.user.id && member.is_extra && member.renewal_approved_by_me !== null ? <Button styles={styles} title={t(member.renewal_approved_by_me ? 'settings.stopMyApproval' : 'settings.reapproveMonthly')} onPress={() => changeRenewalApproval(member)} secondary={member.renewal_approved_by_me} disabled={busy} /> : null}
              </View>
            );
          })}
        </View>

        {pendingApprovals.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.needsApproval')}</Text>
            <Text style={styles.help}>{t('settings.needsApprovalHelp')}</Text>
            {pendingApprovals.map((item) => (
              <View key={item.invitation_id} style={styles.approvalCard}>
                <View style={styles.memberHeader}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{initialsForName(item.display_name)}</Text></View>
                  <View style={styles.memberText}>
                    <Text numberOfLines={2} ellipsizeMode="tail" style={styles.memberName}>{item.display_name}</Text>
                    <Text style={styles.role}>{t(item.role === 'observer' ? 'settings.observerRole' : 'settings.participantRole')}</Text>
                  </View>
                </View>
                <View style={styles.twoButtons}>
                  <View style={styles.flex}><Button styles={styles} title={t('settings.reject')} onPress={() => void answerApproval(item, false)} secondary disabled={busy} /></View>
                  <View style={styles.flex}><Button styles={styles} title={t('settings.approve')} onPress={() => void answerApproval(item, true)} disabled={busy} /></View>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.addPerson')}</Text>
          <Text style={styles.help}>{t('settings.addPersonHelp')}</Text>
          <Button styles={styles} title={t('settings.inviteParticipant')} onPress={() => void invite('participant')} disabled={busy} />
          <Button styles={styles} title={t('settings.inviteObserver')} onPress={() => void invite('observer')} secondary disabled={busy} />
          <Text style={styles.privacyNote}>{t('settings.extraPrivacy')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{exportCopy.title}</Text>
          <Text style={styles.help}>{exportCopy.help}</Text>
          <Text style={styles.help}>{exportCopy.rangeHelp}</Text>
          {!premiumActive ? <Text accessibilityLiveRegion="polite" style={styles.premiumNote}>{exportCopy.premiumRequired}</Text> : null}
          <Text style={styles.smallLabel}>{exportCopy.startDate}</Text>
          <TextInput
            accessibilityLabel={exportCopy.startDate}
            autoCapitalize="none"
            autoCorrect={false}
            editable={premiumActive && !busy}
            maxLength={10}
            onChangeText={setExportStartDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.subtle}
            style={styles.aliasInput}
            value={exportStartDate}
          />
          <Text style={styles.smallLabel}>{exportCopy.endDate}</Text>
          <TextInput
            accessibilityLabel={exportCopy.endDate}
            autoCapitalize="none"
            autoCorrect={false}
            editable={premiumActive && !busy}
            maxLength={10}
            onChangeText={setExportEndDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.subtle}
            style={styles.aliasInput}
            value={exportEndDate}
          />
          {exportRangeError ? <Text accessibilityLiveRegion="polite" style={styles.inputError}>{exportRangeError}</Text> : null}
          <Button styles={styles} title={exportCopy.action} onPress={confirmExport} secondary disabled={busy || !premiumActive || !exportRangeValidation.valid} />
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

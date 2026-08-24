import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { initialsForName } from '../domain/chatPresentation';
import { signOut } from '../services/auth';
import { useNativeStoreBilling } from '../hooks/useNativeStoreBilling';
import { acceptInvitation, acceptMemberInvitation, createInvitation, getMemberPaymentOffer, installMyActiveMemberKeys, listMyPendingMemberships, listRelationshipMembers, listRelationships, type PendingMembership, type RelationshipMember, type RelationshipSummary } from '../services/relationships';
import { createMemberWriteUpgradeRequest, listMyMemberWriteUpgradeRequests, listPendingMemberWriteUpgradeApprovals, respondMemberWriteUpgrade, type MemberWriteUpgradeRequest, type PendingMemberWriteUpgradeApproval } from '../services/memberBilling';
import { releaseWaitingMessages } from '../services/windows';
import { useAppTheme, type AppColors, type AppearanceMode } from '../theme/AppTheme';
import ChatScreen from './ChatScreen';
import MessageWindowsScreen from './MessageWindowsScreen';
import FeedbackScreen from './FeedbackScreen';
import PremiumGiftsScreen from './PremiumGiftsScreen';
import AccountScreen from './AccountScreen';
import { createKeyRecoveryRequest, fulfillKeyRecoveryRequest, getKeyRecoveryApproval, installFulfilledKeyRecoveries } from '../services/keyRecovery';
import { useI18n } from '../i18n/I18nContext';

type PendingInvite = { kind: 'invite' | 'member'; token: string };
type PendingRecovery = { token: string };

function Action({ title, onPress, styles, disabled = false, quiet = false }: { title: string; onPress: () => void; styles: ReturnType<typeof makeStyles>; disabled?: boolean; quiet?: boolean }) {
  return (
    <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, quiet && styles.quietAction, disabled && styles.disabled]}>
      <Text style={[styles.actionText, quiet && styles.quietActionText]}>{title}</Text>
    </TouchableOpacity>
  );
}

function conversationTitle(members: RelationshipMember[], me: string, memberLabel: string, newConversationLabel: string) {
  const others = members.filter((member) => member.user_id !== me).map((member) => member.display_name.trim() || memberLabel);
  if (!others.length) return newConversationLabel;
  if (others.length <= 2) return others.join(', ');
  return `${others.slice(0, 2).join(', ')} +${others.length - 2}`;
}

export default function HomeScreen({ session, pendingInvite, clearPendingInvite, pendingRecovery, clearPendingRecovery }: { session: Session; pendingInvite: PendingInvite | null; clearPendingInvite: () => void; pendingRecovery: PendingRecovery | null; clearPendingRecovery: () => void }) {
  const { colors, mode, resolved, setMode } = useAppTheme();
  const { t, locale } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [relationships, setRelationships] = useState<RelationshipSummary[]>([]);
  const [members, setMembers] = useState<Record<string, RelationshipMember[]>>({});
  const [pendingMemberships, setPendingMemberships] = useState<PendingMembership[]>([]);
  const [writeUpgrades, setWriteUpgrades] = useState<MemberWriteUpgradeRequest[]>([]);
  const [writeUpgradeApprovals, setWriteUpgradeApprovals] = useState<PendingMemberWriteUpgradeApproval[]>([]);
  const [missingSecureKeys, setMissingSecureKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<RelationshipSummary | null>(null);
  const [showWindows, setShowWindows] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showPremiumGifts, setShowPremiumGifts] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [giftRecipientEmail, setGiftRecipientEmail] = useState('');
  const upgradeCopy = locale === 'da' ? {
    title: 'Skriveadgang',
    requestBody: 'Du er skrivebeskyttet i denne chat. Du kan anmode om deltageradgang. Alle andre nuværende medlemmer skal godkende først.',
    requestAction: 'Anmod om skriveadgang',
    waiting: 'Venter på godkendelse fra alle nuværende chatmedlemmer. Der kan ikke ske nogen betaling endnu.',
    ready: 'Alle har godkendt. Butikken viser den præcise forholdsmæssige pris for skiftet. Derefter fornyes medlemskabet til 99 kr./md.',
    checkoutPending: 'Butiksopgraderingen er startet. Hvis den blev afbrudt, kan du fortsætte den samme godkendte opgradering igen.',
    approval: (name: string) => `${name} anmoder om skriveadgang`,
    approvalHelp: 'Skriveadgang aktiveres kun, hvis alle nuværende medlemmer godkender. Din godkendelse koster dig ikke noget.',
    requested: 'Anmodning sendt',
    requestedBody: 'De andre nuværende chatmedlemmer skal godkende, før en eventuel butiksopgradering bliver mulig.',
    rejected: 'Skriveadgang blev ikke godkendt.',
    approved: 'Din godkendelse er registreret.',
  } : {
    title: 'Writing access',
    requestBody: 'You are read-only in this chat. You can request participant access. Every other current member must approve first.',
    requestAction: 'Request writing access',
    waiting: 'Waiting for every current chat member to approve. No payment can happen yet.',
    ready: 'Everyone approved. The store shows the exact prorated price for the change. The membership then renews at 99 DKK/month.',
    checkoutPending: 'The store upgrade has started. If it was interrupted, you can continue the same approved upgrade again.',
    approval: (name: string) => `${name} requests writing access`,
    approvalHelp: 'Writing access is enabled only if every current member approves. Your approval does not charge you.',
    requested: 'Request sent',
    requestedBody: 'The other current chat members must approve before any store upgrade becomes available.',
    rejected: 'Writing access was not approved.',
    approved: 'Your approval was recorded.',
  };

  const storeBilling = useNativeStoreBilling(session.user.id, {
    onError: (message) => Alert.alert(t('home.storeUnavailable'), message),
    onPurchaseVerified: async () => {
      await refreshRelationships();
      Alert.alert(t('home.purchaseVerified'), t('home.purchaseVerifiedBody'));
    },
    onRestoreFinished: async (count) => {
      await refreshRelationships();
      Alert.alert(
        count > 0 ? t('home.purchasesRestored') : t('home.nothingRestore'),
        count > 0 ? t(count === 1 ? 'home.restoredOne' : 'home.restoredMany', { count }) : t('home.noRestored'),
      );
    },
  });

  async function refreshRelationships() {
    await installFulfilledKeyRecoveries();
    const keyResult = await installMyActiveMemberKeys();
    const [nextRelationships, nextPending, nextWriteUpgrades, nextWriteApprovals] = await Promise.all([
      listRelationships(),
      listMyPendingMemberships(),
      listMyMemberWriteUpgradeRequests(),
      listPendingMemberWriteUpgradeApprovals(),
    ]);
    const memberPairs = await Promise.all(nextRelationships.map(async (rel) => [rel.id, await listRelationshipMembers(rel.id)] as const));
    setRelationships(nextRelationships);
    setPendingMemberships(nextPending);
    setWriteUpgrades(nextWriteUpgrades);
    setWriteUpgradeApprovals(nextWriteApprovals);
    setMembers(Object.fromEntries(memberPairs));
    setMissingSecureKeys(keyResult.missing);
  }

  async function requestSecureKey(relationship: RelationshipSummary) {
    try {
      setBusy(true);
      const request = await createKeyRecoveryRequest(relationship.id);
      await Share.share({ message: t('home.recoveryShare', { url: request.url }) });
      Alert.alert(t('home.verifySeparately'), t('home.verifyCode', { code: request.verificationCode }));
    } catch (error) {
      Alert.alert(t('home.recoveryUnavailable'), error instanceof Error ? error.message : t('common.tryAgain'));
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
        t('home.shareKey'),
        t('home.shareKeyBody', { name: request.requester_name, code: request.verification_code }),
        [
          { text: t('home.doNotApprove'), style: 'cancel' },
          {
            text: t('home.approveRecovery'),
            onPress: () => {
              void fulfillKeyRecoveryRequest(pendingRecovery.token, request.relationship_id)
                .then(() => {
                  clearPendingRecovery();
                  Alert.alert(t('home.keyShared'), t('home.keySharedBody'));
                })
                .catch((error) => Alert.alert(t('home.recoveryNotApproved'), error instanceof Error ? error.message : t('common.tryAgain')));
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert(t('home.recoveryUnavailable'), error instanceof Error ? error.message : t('home.newRecoveryLink'));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshRelationships().catch((error) => Alert.alert(t('home.loadChatsError'), error instanceof Error ? error.message : t('common.tryAgain')));
  }, []);

  async function makeInvite() {
    try {
      setBusy(true);
      const invite = await createInvitation();
      await Share.share({ message: t('home.inviteShare', { url: invite.url }) });
      await refreshRelationships();
    } catch (error) {
      Alert.alert(t('home.inviteCreateError'), error instanceof Error ? error.message : t('common.tryAgain'));
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
        Alert.alert(t('home.connected'), t('home.connectedBody'));
      } else {
        const result = await acceptMemberInvitation(pendingInvite.token);
        clearPendingInvite();
        await refreshRelationships();
        if (result.status === 'active') Alert.alert(t('home.added'), t('home.addedBody'));
        else if (result.status === 'awaiting_payment') Alert.alert(t('home.approved'), t('home.approvedBody'));
        else Alert.alert(t('home.waitingApproval'), t('home.waitingApprovalBody'));
      }
    } catch (error) {
      Alert.alert(t('home.inviteNotAccepted'), error instanceof Error ? error.message : t('home.newInvitation'));
    } finally {
      setBusy(false);
    }
  }

  async function showPaymentOffer(item: PendingMembership) {
    try {
      setBusy(true);
      const offer = await getMemberPaymentOffer(item.invitation_id);
      if (!offer.ready_to_pay) {
        Alert.alert(t('home.notReadyPayment'), t('home.notReadyPaymentBody'));
        return;
      }
      Alert.alert(
        t('home.monthlyPrice', { price: offer.price_dkk }),
        t('home.extraPaymentBody', { access: t(offer.role === 'observer' ? 'home.readOnlyAccess' : 'home.writingAccess') }),
        [
          { text: t('home.notNow'), style: 'cancel' },
          {
            text: t('home.continueStore'),
            onPress: () => {
              void storeBilling.purchaseExtraMember(item.invitation_id, offer.role)
                .catch((error) => Alert.alert(t('home.purchaseStartError'), error instanceof Error ? error.message : t('common.tryAgain')));
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert(t('home.offerUnavailable'), error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  }

  async function requestWriteAccess(relationshipId: string) {
    try {
      setBusy(true);
      await createMemberWriteUpgradeRequest(relationshipId);
      await refreshRelationships();
      Alert.alert(upgradeCopy.requested, upgradeCopy.requestedBody);
    } catch (error) {
      Alert.alert(upgradeCopy.title, error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  }

  async function respondWriteAccess(requestId: string, approve: boolean) {
    try {
      setBusy(true);
      const result = await respondMemberWriteUpgrade(requestId, approve);
      await refreshRelationships();
      Alert.alert(upgradeCopy.title, result === 'rejected' ? upgradeCopy.rejected : upgradeCopy.approved);
    } catch (error) {
      Alert.alert(upgradeCopy.title, error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  }

  function continueWriteUpgrade(relationshipId: string) {
    Alert.alert(
      t('home.monthlyPrice', { price: 99 }),
      upgradeCopy.ready,
      [
        { text: t('home.notNow'), style: 'cancel' },
        {
          text: t('home.continueStore'),
          onPress: () => {
            void storeBilling.purchaseMemberUpgrade(relationshipId)
              .then(() => refreshRelationships())
              .catch((error) => Alert.alert(t('home.purchaseStartError'), error instanceof Error ? error.message : t('common.tryAgain')));
          },
        },
      ],
    );
  }

  async function checkWaiting() {
    try {
      setBusy(true);
      const count = await releaseWaitingMessages();
      Alert.alert(count > 0 ? t('home.waitingReleased') : t('home.nothingWaiting'), count > 0 ? t(count === 1 ? 'home.releasedOne' : 'home.releasedMany', { count }) : t('home.noWaiting'));
    } catch (error) {
      Alert.alert(t('home.checkWaitingError'), error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  }

  function buyIndividualPremium() {
    Alert.alert(
      t('home.individualTitle'),
      t('home.individualBody'),
      [
        { text: t('home.notNow'), style: 'cancel' },
        {
          text: t('home.continueStore'),
          onPress: () => {
            void storeBilling.purchasePremium('premium_individual_monthly')
              .catch((error) => Alert.alert(t('home.purchaseStartError'), error instanceof Error ? error.message : t('common.tryAgain')));
          },
        },
      ],
    );
  }

  function buyPremiumGift() {
    const recipient = giftRecipientEmail.trim();
    if (!recipient) {
      Alert.alert(t('home.recipientNeeded'), t('home.recipientNeededBody'));
      return;
    }
    Alert.alert(
      t('home.giftConfirmTitle'),
      t('home.giftConfirmBody', { recipient }),
      [
        { text: t('home.notNow'), style: 'cancel' },
        {
          text: t('home.continueStore'),
          onPress: () => {
            void storeBilling.purchasePremiumGift(recipient)
              .then(() => setGiftRecipientEmail(''))
              .catch((error) => Alert.alert(t('home.giftStartError'), error instanceof Error ? error.message : t('common.tryAgain')));
          },
        },
      ],
    );
  }

  const approvedPending = useMemo(() => pendingMemberships.find((item) => item.status === 'awaiting_payment') ?? null, [pendingMemberships]);
  const pendingText = useMemo(() => approvedPending
    ? t(approvedPending.role === 'observer' ? 'home.pendingReadOnly' : 'home.pendingWriting')
    : pendingMemberships.length ? t('home.pendingApproval') : null, [approvedPending, pendingMemberships, t]);

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
          <TouchableOpacity accessibilityRole="button" onPress={() => void signOut()} style={styles.headerButton}><Text style={styles.headerButtonText}>{t('home.signOut')}</Text></TouchableOpacity>
        </View>

        {pendingInvite ? (
          <View style={styles.invitationBanner}>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>{t(pendingInvite.kind === 'member' ? 'home.groupInvitation' : 'home.conversationInvitation')}</Text>
              <Text style={styles.bannerHelp}>{t(pendingInvite.kind === 'member' ? 'home.groupInvitationHelp' : 'home.conversationInvitationHelp')}</Text>
            </View>
            <Action styles={styles} title={busy ? t('home.pleaseWait') : t('home.accept')} onPress={() => void acceptPendingInvite()} disabled={busy} />
          </View>
        ) : null}

        {pendingRecovery ? (
          <View style={styles.invitationBanner}>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>{t('home.secureRecovery')}</Text>
              <Text style={styles.bannerHelp}>{t('home.secureRecoveryHelp')}</Text>
            </View>
            <Action styles={styles} title={busy ? t('home.pleaseWait') : t('home.reviewRequest')} onPress={() => void reviewKeyRecovery()} disabled={busy} />
          </View>
        ) : null}

        {pendingText ? <View style={styles.pendingNotice}><Text style={styles.pendingNoticeText}>{pendingText}</Text>{approvedPending ? <View style={styles.pendingAction}><Action styles={styles} title={storeBilling.processing ? t('home.processingPurchase') : t('home.viewMembership')} onPress={() => void showPaymentOffer(approvedPending)} disabled={busy || storeBilling.processing || !storeBilling.connected} /></View> : null}</View> : null}

        {writeUpgradeApprovals.map((approval) => {
          const requester = (members[approval.relationship_id] ?? []).find((member) => member.user_id === approval.requester_id);
          const requesterName = requester?.display_name?.trim() || t('chat.member');
          return (
            <View key={approval.request_id} style={styles.pendingNotice}>
              <Text style={styles.upgradeTitle}>{upgradeCopy.approval(requesterName)}</Text>
              <Text style={styles.pendingNoticeText}>{upgradeCopy.approvalHelp}</Text>
              <View style={styles.approvalActions}>
                <View style={styles.approvalAction}><Action styles={styles} title={t('settings.reject')} onPress={() => void respondWriteAccess(approval.request_id, false)} disabled={busy} quiet /></View>
                <View style={styles.approvalAction}><Action styles={styles} title={t('settings.approve')} onPress={() => void respondWriteAccess(approval.request_id, true)} disabled={busy} /></View>
              </View>
            </View>
          );
        })}

        {relationships.filter((relationship) => relationship.my_role === 'observer').map((relationship) => {
          const request = writeUpgrades.find((item) => item.relationship_id === relationship.id);
          const relMembers = members[relationship.id] ?? [];
          const title = conversationTitle(relMembers, session.user.id, t('chat.member'), t('home.newConversation'));
          const activeStatus = request && !['completed', 'rejected', 'expired'].includes(request.status) ? request.status : null;
          const body = activeStatus === 'awaiting_approvals'
            ? upgradeCopy.waiting
            : activeStatus === 'awaiting_payment'
              ? upgradeCopy.ready
              : activeStatus === 'checkout_pending'
                ? upgradeCopy.checkoutPending
                : upgradeCopy.requestBody;
          return (
            <View key={`write-upgrade-${relationship.id}`} style={styles.pendingNotice}>
              <Text style={styles.upgradeTitle}>{upgradeCopy.title} · {title}</Text>
              <Text style={styles.pendingNoticeText}>{body}</Text>
              {!activeStatus ? <Action styles={styles} title={upgradeCopy.requestAction} onPress={() => void requestWriteAccess(relationship.id)} disabled={busy} quiet /> : null}
              {activeStatus === 'awaiting_payment' || activeStatus === 'checkout_pending' ? (
                <Action styles={styles} title={storeBilling.processing ? t('home.processingPurchase') : t('home.continueStore')} onPress={() => continueWriteUpgrade(relationship.id)} disabled={busy || storeBilling.processing || !storeBilling.connected} />
              ) : null}
            </View>
          );
        })}

        {missingSecureKeys.length ? <View style={styles.securityNotice}><Text style={styles.securityTitle}>{t('home.keyNeeded')}</Text><Text style={styles.securityText}>{t('home.keyNeededBody')}</Text></View> : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.chats')}</Text>
          <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void makeInvite()}><Text style={styles.newChat}>{t('home.newChat')}</Text></TouchableOpacity>
        </View>

        <View style={styles.chatList}>
          {relationships.map((rel) => {
            const relMembers = members[rel.id] ?? [];
            const title = conversationTitle(relMembers, session.user.id, t('chat.member'), t('home.newConversation'));
            const initials = initialsForName(title);
            const subtitle = rel.my_role === 'observer' ? t('chat.observerPeople', { count: rel.member_count }) : rel.member_count > 2 ? t('chat.people', { count: rel.member_count }) : t('chat.privateConversation');
            const keyMissing = missingSecureKeys.includes(rel.id);
            return (
              <TouchableOpacity accessibilityRole="button" key={rel.id} disabled={busy} onPress={() => keyMissing ? void requestSecureKey(rel) : setSelected(rel)} style={[styles.chatRow, busy && styles.disabled]}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
                <View style={styles.chatText}>
                  <Text numberOfLines={2} ellipsizeMode="tail" style={styles.chatTitle}>{title}</Text>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={styles.chatSubtitle}>{keyMissing ? t('home.keyUnavailable') : subtitle}</Text>
                </View>
                <Text style={styles.chevron}>{keyMissing ? t('home.key') : '›'}</Text>
              </TouchableOpacity>
            );
          })}
          {!relationships.length ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{t('home.noChats')}</Text>
              <Text style={styles.emptyText}>{t('home.noChatsBody')}</Text>
              <Action styles={styles} title={t('home.startChat')} onPress={() => void makeInvite()} disabled={busy} />
            </View>
          ) : null}
        </View>

        <View style={styles.tools}>
          <Text style={styles.sectionTitle}>{t('home.premium')}</Text>
          <Text style={styles.toolHelp}>{t('home.premiumHelp')}</Text>
          <Action styles={styles} title={storeBilling.processing ? t('home.processingPurchase') : t('home.individualAction')} onPress={buyIndividualPremium} disabled={storeBilling.processing || !storeBilling.connected} />
          <Text style={styles.privacy}>{t('home.twoPersonHelp')}</Text>
          <View style={styles.giftDivider} />
          <Text style={styles.giftTitle}>{t('home.giftTitle')}</Text>
          <Text style={styles.toolHelp}>{t('home.giftHelp')}</Text>
          <TextInput
            accessibilityLabel={t('home.giftEmailLabel')}
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
          <Action styles={styles} title={storeBilling.processing ? t('home.processingPurchase') : t('home.giftAction')} onPress={buyPremiumGift} disabled={storeBilling.processing || !storeBilling.connected} quiet />
          <Action styles={styles} title={t('home.manageGifts')} onPress={() => setShowPremiumGifts(true)} quiet />
        </View>

        <View style={styles.tools}>
          <Text style={styles.sectionTitle}>{t('home.quietControls')}</Text>
          <Text style={styles.toolHelp}>{t('home.quietHelp')}</Text>
          <Action styles={styles} title={t('windows.title')} onPress={() => setShowWindows(true)} quiet />
          <Action styles={styles} title={t('home.checkWaiting')} onPress={() => void checkWaiting()} disabled={busy} quiet />
        </View>

        <View style={styles.tools}>
          <Text style={styles.sectionTitle}>{t('home.appearance')}</Text>
          <Text style={styles.toolHelp}>{t('home.appearanceHelp', { appearance: t(resolved === 'dark' ? 'home.appearanceDark' : 'home.appearanceLight') })}</Text>
          <View style={styles.appearanceRow}>
            {appearanceOptions.map((option) => (
              <TouchableOpacity key={option} accessibilityRole="button" accessibilityState={{ selected: mode === option }} onPress={() => void setMode(option)} style={[styles.appearanceChip, mode === option && styles.appearanceChipSelected]}>
                <Text style={[styles.appearanceChipText, mode === option && styles.appearanceChipTextSelected]}>{t(option === 'system' ? 'home.appearanceSystem' : option === 'light' ? 'home.appearanceLight' : 'home.appearanceDark')}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.tools}>
          <Text style={styles.sectionTitle}>TalkTwo</Text>
          <Action styles={styles} title={storeBilling.processing ? t('home.checkingPurchases') : t('home.restorePurchases')} onPress={() => void storeBilling.restore().catch((error) => Alert.alert(t('home.restoreUnavailable'), error instanceof Error ? error.message : t('common.tryAgain')))} disabled={storeBilling.processing || !storeBilling.connected} quiet />
          <Action styles={styles} title={t('home.sendFeedback')} onPress={() => setShowFeedback(true)} quiet />
          <Action styles={styles} title={t('home.accountPrivacy')} onPress={() => setShowAccount(true)} quiet />
          <Text style={styles.privacy}>{t('home.privacyBody')}</Text>
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
    upgradeTitle: { color: colors.noticeText, fontWeight: '800', fontSize: 15, flexShrink: 1 },
    approvalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    approvalAction: { flex: 1, minWidth: 120 },
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

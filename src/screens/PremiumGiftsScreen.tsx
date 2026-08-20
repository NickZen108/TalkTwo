import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { canResendPremiumGift, premiumGiftStatusLabel } from '../domain/premiumGifts';
import {
  claimPremiumGift,
  listMyPendingPremiumGifts,
  listMyPurchasedPremiumGifts,
  rotatePremiumGiftLink,
  type PendingPremiumGift,
  type PurchasedPremiumGift,
} from '../services/premiumGifts';
import { useAppTheme, type AppColors } from '../theme/AppTheme';

function Button({ title, onPress, disabled = false, secondary = false, styles }: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{title}</Text>
    </TouchableOpacity>
  );
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toLocaleDateString() : 'unknown date';
}

export default function PremiumGiftsScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pending, setPending] = useState<PendingPremiumGift[]>([]);
  const [purchased, setPurchased] = useState<PurchasedPremiumGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyGiftId, setBusyGiftId] = useState<string | null>(null);

  async function refresh() {
    const [nextPending, nextPurchased] = await Promise.all([
      listMyPendingPremiumGifts(),
      listMyPurchasedPremiumGifts(),
    ]);
    setPending(nextPending);
    setPurchased(nextPurchased);
  }

  useEffect(() => {
    void refresh()
      .catch((error) => Alert.alert('Gifts could not be loaded', error instanceof Error ? error.message : 'Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  function activate(gift: PendingPremiumGift) {
    Alert.alert(
      'Activate Premium gift?',
      `This adds ${gift.duration_months} month${gift.duration_months === 1 ? '' : 's'} of Premium to this TalkTwo account.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Activate',
          onPress: () => {
            setBusyGiftId(gift.gift_id);
            void claimPremiumGift(gift.gift_id)
              .then(async (premiumEndsAt) => {
                await refresh();
                Alert.alert('Premium activated', `Premium is now available through ${dateLabel(premiumEndsAt)}.`);
              })
              .catch((error) => Alert.alert('Gift could not be activated', error instanceof Error ? error.message : 'Please try again.'))
              .finally(() => setBusyGiftId(null));
          },
        },
      ],
    );
  }

  async function resend(gift: PurchasedPremiumGift) {
    try {
      setBusyGiftId(gift.gift_id);
      const link = await rotatePremiumGiftLink(gift.gift_id);
      await Share.share({
        message: `A one-month TalkTwo Premium gift is waiting for you. Open this link in TalkTwo: ${link.url}\n\nThe gift is also tied to your TalkTwo email, so you can still find it after signing in if this link is lost.`,
      });
      await refresh();
    } catch (error) {
      Alert.alert('Gift link could not be created', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyGiftId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Premium gifts</Text>
            <Text style={styles.subtitle}>Paid value belongs to the recipient account—not to a fragile link.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gifts waiting for you</Text>
          <Text style={styles.help}>TalkTwo finds gifts by your verified account email. The original link is optional.</Text>
          {pending.map((gift) => (
            <View key={gift.gift_id} style={styles.card}>
              <Text style={styles.cardTitle}>{gift.duration_months} month{gift.duration_months === 1 ? '' : 's'} of Premium</Text>
              <Text style={styles.meta}>Activate by {dateLabel(gift.claim_expires_at)}</Text>
              <Button styles={styles} title={busyGiftId === gift.gift_id ? 'Activating…' : 'Activate gift'} onPress={() => activate(gift)} disabled={busyGiftId !== null} />
            </View>
          ))}
          {!loading && !pending.length ? <Text style={styles.empty}>No unclaimed gifts are waiting for this email.</Text> : null}
          {loading ? <Text style={styles.empty}>Checking gifts…</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gifts you bought</Text>
          <Text style={styles.help}>Creating a new link invalidates the previous link. It never changes who owns the paid gift.</Text>
          {purchased.map((gift) => {
            const canResend = canResendPremiumGift(gift);
            return (
              <View key={gift.gift_id} style={styles.card}>
                <Text numberOfLines={2} ellipsizeMode="middle" style={styles.cardTitle}>{gift.recipient_email}</Text>
                <Text style={styles.meta}>{premiumGiftStatusLabel(gift.status)} · {gift.duration_months} month{gift.duration_months === 1 ? '' : 's'}</Text>
                <Text style={styles.meta}>{gift.status === 'claimed' && gift.claimed_at ? `Activated ${dateLabel(gift.claimed_at)}` : `Claim by ${dateLabel(gift.claim_expires_at)}`}</Text>
                {canResend ? <Button styles={styles} title={busyGiftId === gift.gift_id ? 'Creating link…' : 'Create and share a new link'} onPress={() => void resend(gift)} disabled={busyGiftId !== null} secondary /> : null}
              </View>
            );
          })}
          {!loading && !purchased.length ? <Text style={styles.empty}>You have not bought any Premium gifts yet.</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 14 },
    header: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: 8 },
    backButton: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    backText: { fontSize: 36, lineHeight: 40, color: colors.brand },
    headerText: { flex: 1, minWidth: 0 },
    title: { fontSize: 23, fontWeight: '800', color: colors.text, flexShrink: 1 },
    subtitle: { marginTop: 2, color: colors.muted, lineHeight: 18, flexShrink: 1 },
    section: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text, flexShrink: 1 },
    help: { color: colors.muted, lineHeight: 20, flexShrink: 1 },
    card: { gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    cardTitle: { color: colors.text, fontWeight: '800', fontSize: 15, flexShrink: 1 },
    meta: { color: colors.subtle, fontSize: 13, lineHeight: 18, flexShrink: 1 },
    empty: { color: colors.subtle, lineHeight: 19, fontStyle: 'italic' },
    button: { minHeight: 44, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.accentStrong },
    secondaryButton: { backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.borderStrong },
    buttonText: { color: colors.accentText, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
    secondaryButtonText: { color: colors.text },
    disabled: { opacity: 0.4 },
  });
}

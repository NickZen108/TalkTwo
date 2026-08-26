import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { canResendPremiumGift } from '../domain/premiumGifts';
import {
  claimPremiumGift,
  listMyPendingPremiumGifts,
  listMyPurchasedPremiumGifts,
  rotatePremiumGiftLink,
  type PendingPremiumGift,
  type PurchasedPremiumGift,
} from '../services/premiumGifts';
import { useAppTheme, type AppColors } from '../theme/AppTheme';
import { useI18n } from '../i18n/I18nContext';
import type { SupportedLocale, TranslationKey } from '../i18n/translations';

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

function dateLabel(value: string, locale: SupportedLocale, unknownDate: string) {
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toLocaleDateString(locale === 'da' ? 'da-DK' : 'en') : unknownDate;
}

function giftStatusKey(status: string): TranslationKey {
  if (status === 'paid') return 'gifts.statusPaid';
  if (status === 'claimed') return 'gifts.statusClaimed';
  if (status === 'expired') return 'gifts.statusExpired';
  if (status === 'refunded') return 'gifts.statusRefunded';
  return 'gifts.statusProcessing';
}

export default function PremiumGiftsScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useAppTheme();
  const { locale, t } = useI18n();
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
      .catch((error) => Alert.alert(t('gifts.loadError'), error instanceof Error ? error.message : t('common.tryAgain')))
      .finally(() => setLoading(false));
  }, []);

  function activate(gift: PendingPremiumGift) {
    Alert.alert(
      t('gifts.activateTitle'),
      t(gift.duration_months === 1 ? 'gifts.activateOne' : 'gifts.activateMany', { count: gift.duration_months }),
      [
        { text: t('home.notNow'), style: 'cancel' },
        {
          text: t('gifts.activate'),
          onPress: () => {
            setBusyGiftId(gift.gift_id);
            void claimPremiumGift(gift.gift_id)
              .then(async (premiumEndsAt) => {
                await refresh();
                Alert.alert(t('gifts.activated'), t('gifts.activatedBody', { date: dateLabel(premiumEndsAt, locale, t('gifts.unknownDate')) }));
              })
              .catch((error) => Alert.alert(t('gifts.activateError'), error instanceof Error ? error.message : t('common.tryAgain')))
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
        message: t('gifts.share', { url: link.url }),
      });
      await refresh();
    } catch (error) {
      Alert.alert(t('gifts.linkError'), error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setBusyGiftId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('gifts.back')} onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('gifts.title')}</Text>
            <Text style={styles.subtitle}>{t('gifts.subtitle')}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('gifts.waitingTitle')}</Text>
          <Text style={styles.help}>{t('gifts.waitingHelp')}</Text>
          {pending.map((gift) => (
            <View key={gift.gift_id} style={styles.card}>
              <Text style={styles.cardTitle}>{t(gift.duration_months === 1 ? 'gifts.monthOne' : 'gifts.monthMany', { count: gift.duration_months })}</Text>
              <Text style={styles.meta}>{t('gifts.activateBy', { date: dateLabel(gift.claim_expires_at, locale, t('gifts.unknownDate')) })}</Text>
              <Button styles={styles} title={busyGiftId === gift.gift_id ? t('gifts.activating') : t('gifts.activateGift')} onPress={() => activate(gift)} disabled={busyGiftId !== null} />
            </View>
          ))}
          {!loading && !pending.length ? <Text style={styles.empty}>{t('gifts.noneWaiting')}</Text> : null}
          {loading ? <Text style={styles.empty}>{t('gifts.checking')}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('gifts.boughtTitle')}</Text>
          <Text style={styles.help}>{t('gifts.boughtHelp')}</Text>
          {purchased.map((gift) => {
            const canResend = canResendPremiumGift(gift);
            return (
              <View key={gift.gift_id} style={styles.card}>
                <Text numberOfLines={2} ellipsizeMode="middle" style={styles.cardTitle}>{gift.recipient_email}</Text>
                <Text style={styles.meta}>{t(giftStatusKey(gift.status))} · {t(gift.duration_months === 1 ? 'gifts.monthOne' : 'gifts.monthMany', { count: gift.duration_months })}</Text>
                <Text style={styles.meta}>{gift.status === 'claimed' && gift.claimed_at ? t('gifts.activatedDate', { date: dateLabel(gift.claimed_at, locale, t('gifts.unknownDate')) }) : t('gifts.claimBy', { date: dateLabel(gift.claim_expires_at, locale, t('gifts.unknownDate')) })}</Text>
                {canResend ? <Button styles={styles} title={busyGiftId === gift.gift_id ? t('gifts.creatingLink') : t('gifts.shareNewLink')} onPress={() => void resend(gift)} disabled={busyGiftId !== null} secondary /> : null}
              </View>
            );
          })}
          {!loading && !purchased.length ? <Text style={styles.empty}>{t('gifts.noneBought')}</Text> : null}
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

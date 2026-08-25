import React, { useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppTheme, type AppColors } from '../theme/AppTheme';
import { useI18n } from '../i18n/I18nContext';

function Button({ title, onPress, styles, disabled = false, quiet = false }: { title: string; onPress: () => void; styles: ReturnType<typeof makeStyles>; disabled?: boolean; quiet?: boolean }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, quiet && styles.quietButton, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, quiet && styles.quietButtonText]}>{title}</Text>
    </TouchableOpacity>
  );
}

export default function PremiumScreen({ onBack, onBuyPremium, onBuyGift, onManageGifts, onRestore, processing, connected }: {
  onBack: () => void;
  onBuyPremium: () => void;
  onBuyGift: (email: string) => void;
  onManageGifts: () => void;
  onRestore: () => void;
  processing: boolean;
  connected: boolean;
}) {
  const { colors } = useAppTheme();
  const { locale, t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [recipient, setRecipient] = useState('');
  const copy = locale === 'da'
    ? { title: 'Premium', subtitle: 'Mere plads og en intelligent kommunikationsvagt.', back: 'Tilbage', gift: 'Giv Premium', giftHelp: 'Indtast modtagerens e-mail. Værdien er knyttet til modtageren, ikke til et enkelt link.' }
    : { title: 'Premium', subtitle: 'More room and an intelligent communication gatekeeper.', back: 'Back', gift: 'Gift Premium', giftHelp: 'Enter the recipient email. The value is tied to the recipient, not to a single link.' };

  function buyGift() {
    const email = recipient.trim();
    if (!email) {
      Alert.alert(t('home.recipientNeeded'), t('home.recipientNeededBody'));
      return;
    }
    onBuyGift(email);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.back} onPress={onBack} style={styles.backButton}><Text style={styles.back}>‹</Text></TouchableOpacity>
        <View style={styles.headerText}>
          <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.subtitle}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('home.premium')}</Text>
          <Text style={styles.help}>{t('home.premiumHelp')}</Text>
          <Button styles={styles} title={processing ? t('home.processingPurchase') : t('home.individualAction')} onPress={onBuyPremium} disabled={processing || !connected} />
          <Text style={styles.note}>{t('home.twoPersonHelp')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{copy.gift}</Text>
          <Text style={styles.help}>{copy.giftHelp}</Text>
          <TextInput
            accessibilityLabel={t('home.giftEmailLabel')}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={!processing}
            keyboardType="email-address"
            onChangeText={setRecipient}
            placeholder="recipient@example.com"
            placeholderTextColor={colors.subtle}
            style={styles.input}
            value={recipient}
          />
          <Button styles={styles} title={processing ? t('home.processingPurchase') : t('home.giftAction')} onPress={buyGift} disabled={processing || !connected} />
          <Button styles={styles} title={t('home.manageGifts')} onPress={onManageGifts} quiet />
        </View>

        <View style={styles.card}>
          <Button styles={styles} title={processing ? t('home.checkingPurchases') : t('home.restorePurchases')} onPress={onRestore} disabled={processing || !connected} quiet />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    header: { minHeight: 68, paddingHorizontal: 8, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    backButton: { width: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    back: { color: colors.brand, fontSize: 36, lineHeight: 40 },
    headerText: { flex: 1, minWidth: 0, paddingRight: 12 },
    title: { color: colors.text, fontSize: 19, fontWeight: '800' },
    subtitle: { marginTop: 2, color: colors.subtle, fontSize: 12 },
    content: { padding: 14, gap: 12, paddingBottom: 36 },
    card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
    help: { color: colors.muted, lineHeight: 20 },
    note: { color: colors.subtle, fontSize: 12, lineHeight: 17 },
    input: { minHeight: 46, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, color: colors.text, backgroundColor: colors.surfaceSoft },
    button: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentStrong },
    quietButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
    buttonText: { color: colors.accentText, fontWeight: '800', textAlign: 'center' },
    quietButtonText: { color: colors.text },
    disabled: { opacity: 0.4 },
  });
}

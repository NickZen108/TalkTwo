import React, { useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { sendMagicLink } from '../services/auth';
import { useAppTheme, type AppColors } from '../theme/AppTheme';
import { useI18n } from '../i18n/I18nContext';
import { getFreeFilterCopy } from '../i18n/freeFilterCopy';

export default function LoginScreen() {
  const { colors } = useAppTheme();
  const { t, locale, setPreference } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const freeFilterCopy = useMemo(() => getFreeFilterCopy(locale), [locale]);
  const [email, setEmail] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function requestLink() {
    try {
      setBusy(true);
      setSentEmail(await sendMagicLink(email));
    } catch (error) {
      Alert.alert(t('login.errorTitle'), error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.brand}>TalkTwo</Text>
          <Text style={styles.tagline}>{t('login.tagline')}</Text>
          <View style={styles.languages}>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: locale === 'en' }} onPress={() => void setPreference('en')} style={[styles.languageButton, locale === 'en' && styles.languageSelected]}><Text style={styles.languageText}>English</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: locale === 'da' }} onPress={() => void setPreference('da')} style={[styles.languageButton, locale === 'da' && styles.languageSelected]}><Text style={styles.languageText}>Dansk</Text></TouchableOpacity>
          </View>
        </View>
        <View accessibilityRole="summary" style={styles.onboarding}>
          <Text style={styles.onboardingTitle}>{t('login.before')}</Text>
          <View style={styles.step}><Text style={styles.stepNumber}>1</Text><Text style={styles.stepText}>{t('login.step1')}</Text></View>
          <View style={styles.step}><Text style={styles.stepNumber}>2</Text><Text style={styles.stepText}>{t('login.step2')}</Text></View>
          <View style={styles.step}><Text style={styles.stepNumber}>3</Text><Text style={styles.stepText}>{t('login.step3')}</Text></View>
          <Text style={styles.filterLanguageNote}>{freeFilterCopy.semanticLimit}</Text>
          <Text style={styles.safetyNote}>{t('login.safety')}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.title}>{t('login.title')}</Text>
          {!sentEmail ? <>
            <Text style={styles.help}>{t('login.help')}</Text>
            <TextInput accessibilityLabel={t('login.emailLabel')} autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" returnKeyType="send" textContentType="emailAddress" value={email} onChangeText={setEmail} onSubmitEditing={() => { if (!busy && email.includes('@')) void requestLink(); }} placeholder="you@example.com" placeholderTextColor={colors.subtle} style={styles.input} />
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy || !email.includes('@'), busy }} accessibilityLabel={t('login.sendLabel')} onPress={() => void requestLink()} disabled={busy || !email.includes('@')} style={[styles.button, (busy || !email.includes('@')) && styles.disabled]}>
              <Text style={styles.buttonText}>{busy ? t('login.sending') : t('login.sendLabel')}</Text>
            </TouchableOpacity>
          </> : <>
            <Text accessibilityLiveRegion="polite" style={styles.help}>{t('login.sent')}</Text>
            <Text style={styles.email}>{sentEmail}</Text>
            <Text style={styles.help}>{t('login.openEmail')}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => { setSentEmail(''); setEmail(''); }} style={styles.secondary}><Text style={styles.secondaryText}>{t('login.anotherEmail')}</Text></TouchableOpacity>
          </>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { padding: 22, gap: 16 },
    header: { marginTop: 24, marginBottom: 8 },
    brand: { fontSize: 34, fontWeight: '800', color: colors.brand },
    tagline: { marginTop: 4, color: colors.muted },
    languages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    languageButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
    languageSelected: { borderColor: colors.accent, borderWidth: 2 },
    languageText: { color: colors.text, fontWeight: '700' },
    onboarding: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: colors.border, gap: 12 },
    onboardingTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
    step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    stepNumber: { width: 26, height: 26, borderRadius: 13, textAlign: 'center', textAlignVertical: 'center', lineHeight: 26, overflow: 'hidden', backgroundColor: colors.avatar, color: colors.avatarText, fontWeight: '800' },
    stepText: { flex: 1, color: colors.muted, lineHeight: 20 },
    filterLanguageNote: { color: colors.muted, fontSize: 12, lineHeight: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 },
    safetyNote: { color: colors.subtle, fontSize: 12, lineHeight: 18 },
    card: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: colors.border, gap: 12 },
    title: { fontSize: 20, fontWeight: '800', color: colors.text },
    help: { color: colors.muted, lineHeight: 20 },
    email: { fontWeight: '800', fontSize: 16, color: colors.text },
    input: { minHeight: 50, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, backgroundColor: colors.input, color: colors.text },
    button: { backgroundColor: colors.accentStrong, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    buttonText: { color: colors.accentText, fontWeight: '800' },
    disabled: { opacity: 0.3 },
    secondary: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.surface },
    secondaryText: { fontWeight: '800', color: colors.text },
  });
}

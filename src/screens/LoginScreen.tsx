import React, { useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { sendMagicLink } from '../services/auth';
import { useAppTheme, type AppColors } from '../theme/AppTheme';

export default function LoginScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function requestLink() {
    try {
      setBusy(true);
      setSentEmail(await sendMagicLink(email));
    } catch (error) {
      Alert.alert('Could not send sign-in email', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.brand}>TalkTwo</Text>
          <Text style={styles.tagline}>A calmer place for difficult conversations.</Text>
        </View>
        <View accessibilityRole="summary" style={styles.onboarding}>
          <Text style={styles.onboardingTitle}>Before you begin</Text>
          <View style={styles.step}><Text style={styles.stepNumber}>1</Text><Text style={styles.stepText}>Invite the people you choose. Extra members join only after everyone already in the chat approves.</Text></View>
          <View style={styles.step}><Text style={styles.stepNumber}>2</Text><Text style={styles.stepText}>You decide when to open sensitive messages. Blocking is private and affects future messages.</Text></View>
          <View style={styles.step}><Text style={styles.stepNumber}>3</Text><Text style={styles.stepText}>Names, colours and conversation appearance stay local to your device. Readable exports are always an explicit choice.</Text></View>
          <Text style={styles.safetyNote}>TalkTwo supports calmer communication. It is not emergency, medical, legal or crisis support.</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.title}>Sign in</Text>
          {!sentEmail ? <>
            <Text style={styles.help}>Enter your email. We will send you a secure sign-in link. No password needed.</Text>
            <TextInput accessibilityLabel="Email address" autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" returnKeyType="send" textContentType="emailAddress" value={email} onChangeText={setEmail} onSubmitEditing={() => { if (!busy && email.includes('@')) void requestLink(); }} placeholder="you@example.com" placeholderTextColor={colors.subtle} style={styles.input} />
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy || !email.includes('@'), busy }} accessibilityLabel="Email me a sign-in link" onPress={() => void requestLink()} disabled={busy || !email.includes('@')} style={[styles.button, (busy || !email.includes('@')) && styles.disabled]}>
              <Text style={styles.buttonText}>{busy ? 'Sending…' : 'Email me a sign-in link'}</Text>
            </TouchableOpacity>
          </> : <>
            <Text accessibilityLiveRegion="polite" style={styles.help}>We sent a sign-in link to:</Text>
            <Text style={styles.email}>{sentEmail}</Text>
            <Text style={styles.help}>Open the email on this phone and tap “Sign in”. TalkTwo should open automatically.</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => { setSentEmail(''); setEmail(''); }} style={styles.secondary}><Text style={styles.secondaryText}>Use another email</Text></TouchableOpacity>
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
    onboarding: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: colors.border, gap: 12 },
    onboardingTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
    step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    stepNumber: { width: 26, height: 26, borderRadius: 13, textAlign: 'center', textAlignVertical: 'center', lineHeight: 26, overflow: 'hidden', backgroundColor: colors.avatar, color: colors.avatarText, fontWeight: '800' },
    stepText: { flex: 1, color: colors.muted, lineHeight: 20 },
    safetyNote: { color: colors.subtle, fontSize: 12, lineHeight: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 },
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

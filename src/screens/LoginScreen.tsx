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
        <View style={styles.card}>
          <Text style={styles.title}>Sign in</Text>
          {!sentEmail ? <>
            <Text style={styles.help}>Enter your email. We will send you a secure sign-in link. No password needed.</Text>
            <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.subtle} style={styles.input} />
            <TouchableOpacity onPress={() => void requestLink()} disabled={busy || !email.includes('@')} style={[styles.button, (busy || !email.includes('@')) && styles.disabled]}>
              <Text style={styles.buttonText}>{busy ? 'Sending…' : 'Email me a sign-in link'}</Text>
            </TouchableOpacity>
          </> : <>
            <Text style={styles.help}>We sent a sign-in link to:</Text>
            <Text style={styles.email}>{sentEmail}</Text>
            <Text style={styles.help}>Open the email on this phone and tap “Sign in”. TalkTwo should open automatically.</Text>
            <TouchableOpacity onPress={() => { setSentEmail(''); setEmail(''); }} style={styles.secondary}><Text style={styles.secondaryText}>Use another email</Text></TouchableOpacity>
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

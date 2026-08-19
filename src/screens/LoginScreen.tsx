import React, { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { sendMagicLink } from '../services/auth';

export default function LoginScreen() {
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
            <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" style={styles.input} />
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F2' },
  container: { padding: 22, gap: 16 },
  header: { marginTop: 24, marginBottom: 8 },
  brand: { fontSize: 34, fontWeight: '800', color: '#161616' },
  tagline: { marginTop: 4, color: '#666' },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E5E5E0', gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#161616' },
  help: { color: '#666', lineHeight: 20 },
  email: { fontWeight: '800', fontSize: 16 },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#DADAD5', borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  button: { backgroundColor: '#171717', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#FFF', fontWeight: '800' },
  disabled: { opacity: 0.3 },
  secondary: { borderWidth: 1, borderColor: '#CFCFC9', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { fontWeight: '800', color: '#222' },
});

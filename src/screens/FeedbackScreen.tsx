import React, { useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { submitFeedback, type FeedbackCategory } from '../services/feedback';
import { useAppTheme, type AppColors } from '../theme/AppTheme';

const categories: { id: FeedbackCategory; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'bug', label: 'Something is not working' },
  { id: 'idea', label: 'Idea' },
  { id: 'filter', label: 'Message filter' },
  { id: 'premium', label: 'Premium' },
  { id: 'privacy', label: 'Privacy' },
];

export default function FeedbackScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    try {
      setBusy(true);
      await submitFeedback(category, message);
      setMessage('');
      Alert.alert('Thank you', 'Your feedback was sent to the TalkTwo team.');
    } catch (error) {
      Alert.alert('Feedback was not sent', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <View style={styles.card}>
          <Text style={styles.title}>Help improve TalkTwo</Text>
          <Text style={styles.help}>Tell us what works, what annoys you, or what you think should change. Do not include private conversation content unless it is necessary to explain the problem.</Text>
          <Text style={styles.label}>Topic</Text>
          <View style={styles.chips}>
            {categories.map((item) => (
              <TouchableOpacity key={item.id} onPress={() => setCategory(item.id)} style={[styles.chip, category === item.id && styles.chipSelected]}>
                <Text style={[styles.chipText, category === item.id && styles.chipTextSelected]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Feedback</Text>
          <TextInput
            multiline
            value={message}
            onChangeText={setMessage}
            maxLength={2000}
            placeholder="Write your feedback here…"
            placeholderTextColor={colors.subtle}
            style={styles.input}
          />
          <Text style={styles.counter}>{message.length}/2000</Text>
          <TouchableOpacity disabled={busy || !message.trim()} onPress={() => void send()} style={[styles.button, (busy || !message.trim()) && styles.disabled]}>
            <Text style={styles.buttonText}>{busy ? 'Sending…' : 'Send feedback'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { padding: 22, gap: 16 },
    back: { marginTop: 16, fontWeight: '800', color: colors.text, fontSize: 16 },
    card: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: colors.border, gap: 12 },
    title: { fontSize: 22, fontWeight: '800', color: colors.text },
    help: { color: colors.muted, lineHeight: 20 },
    label: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 4 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface },
    chipSelected: { backgroundColor: colors.accentStrong, borderColor: colors.accentStrong },
    chipText: { color: colors.muted, fontWeight: '700', fontSize: 12 },
    chipTextSelected: { color: colors.accentText },
    input: { minHeight: 150, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, padding: 12, fontSize: 16, textAlignVertical: 'top', backgroundColor: colors.input, color: colors.text },
    counter: { alignSelf: 'flex-end', color: colors.subtle, fontSize: 12 },
    button: { backgroundColor: colors.accentStrong, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    disabled: { opacity: 0.35 },
    buttonText: { color: colors.accentText, fontWeight: '800' },
  });
}

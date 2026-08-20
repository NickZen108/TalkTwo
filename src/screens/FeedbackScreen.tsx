import React, { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { submitFeedback, type FeedbackCategory } from '../services/feedback';

const categories: { id: FeedbackCategory; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'bug', label: 'Something is not working' },
  { id: 'idea', label: 'Idea' },
  { id: 'filter', label: 'Message filter' },
  { id: 'premium', label: 'Premium' },
  { id: 'privacy', label: 'Privacy' },
];

export default function FeedbackScreen({ onBack }: { onBack: () => void }) {
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F2' },
  container: { padding: 22, gap: 16 },
  back: { marginTop: 16, fontWeight: '800', color: '#333', fontSize: 16 },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E5E5E0', gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#161616' },
  help: { color: '#666', lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '800', color: '#333', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#D2D2CC', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipSelected: { backgroundColor: '#171717', borderColor: '#171717' },
  chipText: { color: '#444', fontWeight: '700', fontSize: 12 },
  chipTextSelected: { color: '#FFF' },
  input: { minHeight: 150, borderWidth: 1, borderColor: '#DADAD5', borderRadius: 12, padding: 12, fontSize: 16, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', color: '#777', fontSize: 12 },
  button: { backgroundColor: '#171717', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  disabled: { opacity: 0.35 },
  buttonText: { color: '#FFF', fontWeight: '800' },
});

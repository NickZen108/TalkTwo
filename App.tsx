import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { evaluateFreeMessage, MAX_FREE_LENGTH } from './src/filter/freeFilter';

export default function App() {
  const [message, setMessage] = useState('');
  const result = useMemo(() => evaluateFreeMessage(message), [message]);
  const hasText = message.trim().length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.brand}>TalkTwo</Text>
          <Text style={styles.tagline}>Keep difficult conversations practical.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Message</Text>
          <TextInput
            multiline
            value={message}
            onChangeText={setMessage}
            placeholder="Write a short practical message…"
            style={styles.input}
            maxLength={500}
          />
          <View style={styles.row}>
            <Text style={[styles.counter, message.length > MAX_FREE_LENGTH && styles.counterDanger]}>
              {message.length}/{MAX_FREE_LENGTH}
            </Text>
            <Text style={styles.plan}>FREE</Text>
          </View>
        </View>

        {hasText && (
          <View style={[styles.card, result.canSend ? styles.approved : styles.blocked]}>
            <Text style={styles.statusTitle}>{result.canSend ? 'Ready to send' : 'Message blocked'}</Text>
            <Text style={styles.statusText}>
              {result.canSend
                ? 'This message passes the current free communication rules.'
                : 'Please change the points below before sending.'}
            </Text>

            {result.reasons.map((reason, index) => (
              <View key={`${reason.code}-${index}`} style={styles.reason}>
                <Text style={styles.reasonTitle}>{reason.title}</Text>
                <Text style={styles.reasonText}>{reason.explanation}</Text>
                <Text style={styles.suggestion}>{reason.suggestion}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          disabled={!hasText || !result.canSend}
          style={[styles.sendButton, (!hasText || !result.canSend) && styles.sendButtonDisabled]}
          onPress={() => setMessage('')}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>

        <View style={styles.premiumCard}>
          <Text style={styles.premiumTitle}>Premium preview</Text>
          <Text style={styles.premiumText}>AI review, calm rewrites, Coach, longer messages, Personal Boundaries and exports will live here.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F2' },
  container: { padding: 22, gap: 16 },
  header: { marginTop: 16, marginBottom: 8 },
  brand: { fontSize: 34, fontWeight: '800', color: '#161616' },
  tagline: { marginTop: 4, fontSize: 16, color: '#555' },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E5E5E0' },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 10, color: '#333' },
  input: { minHeight: 130, fontSize: 18, lineHeight: 25, textAlignVertical: 'top', color: '#111' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  counter: { color: '#666' },
  counterDanger: { color: '#8A1C1C', fontWeight: '700' },
  plan: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: '#555' },
  approved: { borderColor: '#6F8E73' },
  blocked: { borderColor: '#A66A6A' },
  statusTitle: { fontSize: 20, fontWeight: '800', color: '#161616' },
  statusText: { marginTop: 6, fontSize: 15, lineHeight: 21, color: '#555' },
  reason: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#ECECE8' },
  reasonTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  reasonText: { marginTop: 4, fontSize: 14, lineHeight: 20, color: '#555' },
  suggestion: { marginTop: 6, fontSize: 14, lineHeight: 20, fontWeight: '600', color: '#303030' },
  sendButton: { backgroundColor: '#171717', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  sendButtonDisabled: { opacity: 0.28 },
  sendButtonText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  premiumCard: { padding: 18, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: '#B9B9B2' },
  premiumTitle: { fontSize: 15, fontWeight: '800', color: '#333' },
  premiumText: { marginTop: 5, color: '#666', lineHeight: 20 },
});

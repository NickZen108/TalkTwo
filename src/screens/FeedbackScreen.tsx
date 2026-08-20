import React, { useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { submitFeedback, type FeedbackCategory } from '../services/feedback';
import { useAppTheme, type AppColors } from '../theme/AppTheme';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';

const categories: { id: FeedbackCategory; labelKey: TranslationKey }[] = [
  { id: 'general', labelKey: 'feedback.general' },
  { id: 'bug', labelKey: 'feedback.bug' },
  { id: 'idea', labelKey: 'feedback.idea' },
  { id: 'filter', labelKey: 'feedback.filter' },
  { id: 'premium', labelKey: 'feedback.premium' },
  { id: 'privacy', labelKey: 'feedback.privacy' },
];

export default function FeedbackScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    try {
      setBusy(true);
      await submitFeedback(category, message);
      setMessage('');
      Alert.alert(t('feedback.thankYou'), t('feedback.sent'));
    } catch (error) {
      Alert.alert(t('feedback.sendError'), error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity accessibilityRole="button" onPress={onBack}><Text style={styles.back}>{t('common.back')}</Text></TouchableOpacity>
        <View style={styles.card}>
          <Text style={styles.title}>{t('feedback.title')}</Text>
          <Text style={styles.help}>{t('feedback.help')}</Text>
          <Text style={styles.label}>{t('feedback.topic')}</Text>
          <View style={styles.chips}>
            {categories.map((item) => (
              <TouchableOpacity key={item.id} onPress={() => setCategory(item.id)} style={[styles.chip, category === item.id && styles.chipSelected]}>
                <Text style={[styles.chipText, category === item.id && styles.chipTextSelected]}>{t(item.labelKey)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>{t('feedback.feedback')}</Text>
          <TextInput
            multiline
            value={message}
            onChangeText={setMessage}
            maxLength={2000}
            placeholder={t('feedback.placeholder')}
            placeholderTextColor={colors.subtle}
            style={styles.input}
          />
          <Text style={styles.counter}>{message.length}/2000</Text>
          <TouchableOpacity disabled={busy || !message.trim()} onPress={() => void send()} style={[styles.button, (busy || !message.trim()) && styles.disabled]}>
            <Text style={styles.buttonText}>{busy ? t('feedback.sending') : t('feedback.send')}</Text>
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

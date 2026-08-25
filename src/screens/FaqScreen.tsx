import React, { useMemo } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme, type AppColors } from '../theme/AppTheme';
import { useI18n } from '../i18n/I18nContext';

export default function FaqScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useAppTheme();
  const { locale } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const copy = locale === 'da' ? {
    title: 'FAQ',
    items: [
      ['Hvorfor bliver min besked blokeret?', 'TalkTwo er lavet til lavkonflikt-kommunikation. Bandeord, fornærmelser, nedladende tillægsord og anden tydeligt eskalerende formulering bliver stoppet.'],
      ['Hvad er forskellen på Free og Premium?', 'Free bruger enkle mekaniske regler og beskeder på op til 160 tegn. Premium kan analysere op til 480 tegn og kan, når Coach er slået til, foreslå en mere neutral formulering.'],
      ['Kan modparten se en blokeret besked?', 'Nej. En besked skal godkendes, før den kan sendes.'],
      ['Hvad betyder skrivebeskyttet?', 'En skrivebeskyttet deltager kan læse chatten, men kan ikke sende beskeder, før skriveadgang er godkendt og aktiveret.'],
      ['Hvad er beskedvinduer?', 'Modtageren kan vælge tidsrum, hvor nye beskeder bliver tilgængelige. Det er lavet for at give mere ro omkring kommunikationen.'],
      ['Kan TalkTwo bruges i nødsituationer?', 'Nej. TalkTwo er ikke en nød-, læge-, juridisk eller krisetjeneste. Brug relevante officielle kanaler ved akutte forhold.'],
    ],
  } : {
    title: 'FAQ',
    items: [
      ['Why was my message blocked?', 'TalkTwo is designed for low-conflict communication. Profanity, insults, degrading adjectives and other clearly escalating wording are stopped.'],
      ['What is the difference between Free and Premium?', 'Free uses simple mechanical rules and messages up to 160 characters. Premium can review up to 480 characters and, when Coach is enabled, may suggest a calmer rewrite.'],
      ['Can the other person see a blocked message?', 'No. A message must pass review before it can be sent.'],
      ['What does read-only mean?', 'A read-only member can read the chat but cannot send messages until writing access is approved and activated.'],
      ['What are message windows?', 'Recipients can choose time periods when new messages become available, helping create calmer boundaries around communication.'],
      ['Can TalkTwo be used for emergencies?', 'No. TalkTwo is not an emergency, medical, legal or crisis service. Use the appropriate official channels for urgent matters.'],
    ],
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" onPress={onBack} style={styles.backButton}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{copy.title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {copy.items.map(([question, answer]) => (
          <View key={question} style={styles.card}>
            <Text style={styles.question}>{question}</Text>
            <Text style={styles.answer}>{answer}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    backButton: { width: 52, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    back: { color: colors.brand, fontSize: 36, lineHeight: 40 },
    title: { flex: 1, minWidth: 0, color: colors.text, fontWeight: '800', fontSize: 19, textAlign: 'center' },
    headerSpacer: { width: 52 },
    content: { padding: 14, gap: 10, paddingBottom: 36 },
    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    question: { color: colors.text, fontSize: 16, fontWeight: '800', lineHeight: 21 },
    answer: { marginTop: 6, color: colors.muted, fontSize: 14, lineHeight: 20 },
  });
}

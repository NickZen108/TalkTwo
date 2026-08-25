import React, { useMemo } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme, type AppColors } from '../../theme/AppTheme';
import { useI18n } from '../../i18n/I18nContext';

export default function FAQScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useAppTheme();
  const { locale } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const copy = locale === 'da' ? {
    back: '‹ Tilbage',
    title: 'FAQ',
    intro: 'Korte svar på de mest almindelige spørgsmål om TalkTwo.',
    items: [
      ['Hvad er TalkTwo?', 'TalkTwo er lavet til samtaler, hvor man gerne vil holde kommunikationen rolig, kort og praktisk.'],
      ['Hvordan virker gratisversionen?', 'Gratisversionen bruger kun simple mekaniske regler. Den prøver ikke at forstå meningen i beskeden. Den stopper blandt andet udråbstegn, emoji, tydelige bandeord/skældsord, overdreven brug af STORE BOGSTAVER og simple gentagelser.'],
      ['Hvad gør Premium?', 'Premium kan bruge AI til at vurdere tonen og foreslå en mere konstruktiv formulering. AI-forslaget sendes aldrig automatisk.'],
      ['Kan den anden se, om jeg har åbnet eller afvist en besked?', 'TalkTwo er designet til ikke at give almindelige læsekvitteringer eller afsløre private afvisninger.'],
      ['Hvorfor kan en besked vente?', 'Du kan selv vælge kommunikationsvinduer. Beskeder kan sendes når som helst, men kan vente med at blive tilgængelige hos dig.'],
      ['Er blokering privat?', 'Ja. TalkTwo forsøger ikke at fortælle den anden person, at du har blokeret eller slået notifikationer fra.'],
      ['Er mine beskeder krypterede?', 'Beskeder lagres krypteret, og den lokale database er krypteret. TalkTwo kalder ikke løsningen zero-knowledge eller fuld end-to-end-kryptering, fordi serveren i visse flows kortvarigt behandler tekst for at håndhæve reglerne.'],
      ['Er TalkTwo til nødsituationer?', 'Nej. TalkTwo er ikke en nød-, læge-, juridisk- eller krisetjeneste.'],
    ] as const,
  } : {
    back: '‹ Back',
    title: 'FAQ',
    intro: 'Short answers to common questions about TalkTwo.',
    items: [
      ['What is TalkTwo?', 'TalkTwo is designed for conversations where people want communication to stay calm, short and practical.'],
      ['How does the Free version work?', 'Free uses simple mechanical rules only. It does not try to understand meaning. It blocks things such as exclamation marks, emoji, obvious profanity/direct insults, excessive CAPITALS and simple repetition.'],
      ['What does Premium do?', 'Premium can use AI to review tone and suggest a more constructive rewrite. An AI suggestion is never sent automatically.'],
      ['Can the other person see whether I opened or rejected a message?', 'TalkTwo is designed not to provide ordinary read receipts or reveal private rejection actions.'],
      ['Why can a message wait?', 'You choose communication windows. Messages can be sent at any time but may wait before becoming available to you.'],
      ['Is blocking private?', 'Yes. TalkTwo does not try to tell the other person that you blocked them or muted notifications.'],
      ['Are my messages encrypted?', 'Messages are stored encrypted and the local database is encrypted. TalkTwo does not call the design zero-knowledge or full end-to-end encryption because the server briefly processes text in some flows to enforce rules.'],
      ['Is TalkTwo for emergencies?', 'No. TalkTwo is not emergency, medical, legal or crisis support.'],
    ] as const,
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>{copy.back}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{copy.title}</Text>
        </View>
        <Text style={styles.intro}>{copy.intro}</Text>
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
    container: { paddingBottom: 42 },
    header: { minHeight: 70, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    backButton: { minHeight: 44, justifyContent: 'center', flexShrink: 0 },
    backText: { color: colors.accent, fontWeight: '800', fontSize: 16 },
    title: { color: colors.text, fontWeight: '800', fontSize: 22 },
    intro: { margin: 16, color: colors.muted, lineHeight: 20 },
    card: { marginHorizontal: 14, marginBottom: 10, padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 7 },
    question: { color: colors.text, fontWeight: '800', fontSize: 16, lineHeight: 21 },
    answer: { color: colors.muted, lineHeight: 20 },
  });
}

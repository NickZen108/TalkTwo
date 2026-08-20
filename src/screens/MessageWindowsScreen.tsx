import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { detectedDeviceTimezone, normalizeIanaTimezone, normalizeMessageWindow } from '../domain/messageWindows';
import { getMyTimezone, listMyWindows, saveMyWindow, setMyTimezone, type MessageWindow } from '../services/windows';
import { useAppTheme, type AppColors } from '../theme/AppTheme';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Draft = { enabled: boolean; start: string; end: string };

function defaultDraft(day: number): Draft {
  const weekend = day === 0 || day === 6;
  return { enabled: !weekend, start: '08:00', end: '18:00' };
}

function initialDrafts(): Record<number, Draft> {
  return Object.fromEntries(DAYS.map((_, day) => [day, defaultDraft(day)])) as Record<number, Draft>;
}

export default function MessageWindowsScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [timezone, setTimezone] = useState('UTC');
  const [deviceTimezone] = useState(detectedDeviceTimezone);
  const [drafts, setDrafts] = useState<Record<number, Draft>>(initialDrafts);
  const [busyDay, setBusyDay] = useState<number | null>(null);
  const [timezoneBusy, setTimezoneBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [storedTimezone, windows] = await Promise.all([getMyTimezone(), listMyWindows()]);
        setTimezone(storedTimezone);

        const next = initialDrafts();
        for (const row of windows as MessageWindow[]) {
          next[row.weekday] = {
            enabled: row.enabled,
            start: row.start_local.slice(0, 5),
            end: row.end_local.slice(0, 5),
          };
        }
        setDrafts(next);
      } catch (error) {
        Alert.alert('Could not load message windows', error instanceof Error ? error.message : 'Please try again.');
      }
    })();
  }, []);

  async function saveDay(day: number) {
    const draft = drafts[day] ?? defaultDraft(day);
    try {
      const { start, end } = normalizeMessageWindow(draft.enabled, draft.start, draft.end);
      setBusyDay(day);
      await saveMyWindow(day, draft.enabled, start, end);
      setDrafts((old) => ({ ...old, [day]: { ...draft, start: start.slice(0, 5), end: end.slice(0, 5) } }));
    } catch (error) {
      Alert.alert('Check this window', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyDay(null);
    }
  }

  async function saveTimezone(nextValue = timezone) {
    try {
      const normalized = normalizeIanaTimezone(nextValue);
      if (!normalized) {
        Alert.alert('Check the timezone', 'Use a valid timezone such as Europe/Copenhagen.');
        return;
      }
      setTimezoneBusy(true);
      const saved = await setMyTimezone(normalized);
      setTimezone(saved);
      Alert.alert('Timezone saved', 'TalkTwo will use this timezone when deciding when waiting messages become available.');
    } catch (error) {
      Alert.alert('Could not save timezone', error instanceof Error ? error.message : 'Please check the timezone name.');
    } finally {
      setTimezoneBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to chats" onPress={onBack} style={styles.backButton}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
          <Text style={styles.title}>Message windows</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Your timezone</Text>
          <Text style={styles.help}>Phone timezone: {deviceTimezone}. TalkTwo keeps your saved choice until you change it.</Text>
          <TextInput accessibilityLabel="Message window timezone" value={timezone} onChangeText={setTimezone} autoCapitalize="none" autoCorrect={false} style={styles.input} placeholder="Europe/Copenhagen" placeholderTextColor={colors.subtle} />
          {timezone !== deviceTimezone ? (
            <TouchableOpacity accessibilityRole="button" onPress={() => void saveTimezone(deviceTimezone)} disabled={timezoneBusy} style={[styles.secondaryButton, timezoneBusy && styles.disabled]}>
              <Text style={styles.secondaryButtonText}>Use phone timezone</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity accessibilityRole="button" onPress={() => void saveTimezone()} disabled={timezoneBusy} style={[styles.button, timezoneBusy && styles.disabled]}>
            <Text style={styles.buttonText}>{timezoneBusy ? 'Saving…' : 'Save timezone'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>When messages may appear</Text>
          <Text style={styles.help}>Messages can be sent at any time, but they stay hidden until one of your open windows begins. You can still check waiting messages whenever you choose.</Text>

          {DAYS.map((name, day) => {
            const draft = drafts[day] ?? defaultDraft(day);
            return (
              <View key={name} style={styles.dayRow}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayName}>{name}</Text>
                  <Switch accessibilityLabel={`${name} message window`} accessibilityRole="switch" value={draft.enabled} onValueChange={(enabled) => setDrafts((old) => ({ ...old, [day]: { ...(old[day] ?? defaultDraft(day)), enabled } }))} />
                </View>
                {draft.enabled ? (
                  <View style={styles.timeRow}>
                    <TextInput accessibilityLabel={`${name} opening time`} value={draft.start} onChangeText={(start) => setDrafts((old) => ({ ...old, [day]: { ...(old[day] ?? defaultDraft(day)), start } }))} style={styles.timeInput} keyboardType="numbers-and-punctuation" maxLength={5} />
                    <Text style={styles.to}>to</Text>
                    <TextInput accessibilityLabel={`${name} closing time`} value={draft.end} onChangeText={(end) => setDrafts((old) => ({ ...old, [day]: { ...(old[day] ?? defaultDraft(day)), end } }))} style={styles.timeInput} keyboardType="numbers-and-punctuation" maxLength={5} />
                  </View>
                ) : <Text style={styles.closed}>Closed</Text>}
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Save ${name} message window`} onPress={() => void saveDay(day)} disabled={busyDay === day} style={styles.saveDay}>
                  <Text style={styles.saveDayText}>{busyDay === day ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { padding: 22, gap: 16 },
    headerRow: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
    backButton: { minHeight: 44, justifyContent: 'center' },
    back: { fontSize: 16, fontWeight: '800', color: colors.text },
    title: { fontSize: 24, fontWeight: '800', color: colors.text, flexShrink: 1 },
    card: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: colors.border, gap: 12 },
    heading: { fontSize: 20, fontWeight: '800', color: colors.text },
    help: { color: colors.muted, lineHeight: 20 },
    input: { minHeight: 50, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: colors.text, backgroundColor: colors.input },
    button: { backgroundColor: colors.accentStrong, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    buttonText: { color: colors.accentText, fontWeight: '800' },
    secondaryButton: { minHeight: 46, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    secondaryButtonText: { color: colors.text, fontWeight: '800' },
    disabled: { opacity: 0.35 },
    dayRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, gap: 10 },
    dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    dayName: { fontSize: 16, fontWeight: '800', color: colors.text },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    timeInput: { width: 90, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingVertical: 10, textAlign: 'center', fontSize: 16, color: colors.text, backgroundColor: colors.input },
    to: { color: colors.muted },
    closed: { color: colors.subtle },
    saveDay: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 2 },
    saveDayText: { fontWeight: '800', color: colors.accent },
  });
}

import React, { useEffect, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getMyTimezone, listMyWindows, saveMyWindow, setMyTimezone, type MessageWindow } from '../services/windows';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Draft = { enabled: boolean; start: string; end: string };

function defaultDraft(day: number): Draft {
  const weekend = day === 0 || day === 6;
  return { enabled: !weekend, start: '08:00', end: '18:00' };
}

function initialDrafts(): Record<number, Draft> {
  return Object.fromEntries(DAYS.map((_, day) => [day, defaultDraft(day)])) as Record<number, Draft>;
}

function normalizeTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

export default function MessageWindowsScreen({ onBack }: { onBack: () => void }) {
  const [timezone, setTimezone] = useState('UTC');
  const [drafts, setDrafts] = useState<Record<number, Draft>>(initialDrafts);
  const [busyDay, setBusyDay] = useState<number | null>(null);
  const [timezoneBusy, setTimezoneBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [storedTimezone, windows] = await Promise.all([getMyTimezone(), listMyWindows()]);
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const chosen = storedTimezone === 'UTC' && detected !== 'UTC' ? detected : storedTimezone;
        setTimezone(chosen);
        if (chosen !== storedTimezone) await setMyTimezone(chosen);

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
    const start = normalizeTime(draft.start);
    const end = normalizeTime(draft.end);
    if (!start || !end) {
      Alert.alert('Check the time', 'Use 24-hour time such as 08:00 or 17:30.');
      return;
    }
    try {
      setBusyDay(day);
      await saveMyWindow(day, draft.enabled, start, end);
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyDay(null);
    }
  }

  async function saveTimezone() {
    try {
      setTimezoneBusy(true);
      const saved = await setMyTimezone(timezone);
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
          <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
          <Text style={styles.title}>Message windows</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Your timezone</Text>
          <Text style={styles.help}>TalkTwo detects this automatically. Change it only if it is wrong.</Text>
          <TextInput value={timezone} onChangeText={setTimezone} autoCapitalize="none" style={styles.input} placeholder="Europe/Copenhagen" />
          <TouchableOpacity onPress={() => void saveTimezone()} disabled={timezoneBusy} style={[styles.button, timezoneBusy && styles.disabled]}>
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
                  <Switch value={draft.enabled} onValueChange={(enabled) => setDrafts((old) => ({ ...old, [day]: { ...(old[day] ?? defaultDraft(day)), enabled } }))} />
                </View>
                {draft.enabled ? (
                  <View style={styles.timeRow}>
                    <TextInput value={draft.start} onChangeText={(start) => setDrafts((old) => ({ ...old, [day]: { ...(old[day] ?? defaultDraft(day)), start } }))} style={styles.timeInput} keyboardType="numbers-and-punctuation" />
                    <Text style={styles.to}>to</Text>
                    <TextInput value={draft.end} onChangeText={(end) => setDrafts((old) => ({ ...old, [day]: { ...(old[day] ?? defaultDraft(day)), end } }))} style={styles.timeInput} keyboardType="numbers-and-punctuation" />
                  </View>
                ) : <Text style={styles.closed}>Closed</Text>}
                <TouchableOpacity onPress={() => void saveDay(day)} disabled={busyDay === day} style={styles.saveDay}>
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F2' },
  container: { padding: 22, gap: 16 },
  headerRow: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
  back: { fontSize: 16, fontWeight: '800', color: '#333' },
  title: { fontSize: 24, fontWeight: '800', color: '#161616' },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E5E5E0', gap: 12 },
  heading: { fontSize: 20, fontWeight: '800', color: '#161616' },
  help: { color: '#666', lineHeight: 20 },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#DADAD5', borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  button: { backgroundColor: '#171717', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#FFF', fontWeight: '800' },
  disabled: { opacity: 0.35 },
  dayRow: { borderTopWidth: 1, borderTopColor: '#ECECE8', paddingTop: 14, gap: 10 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayName: { fontSize: 16, fontWeight: '800', color: '#222' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeInput: { width: 90, borderWidth: 1, borderColor: '#DADAD5', borderRadius: 10, paddingVertical: 10, textAlign: 'center', fontSize: 16 },
  to: { color: '#666' },
  closed: { color: '#777' },
  saveDay: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 2 },
  saveDayText: { fontWeight: '800', color: '#333' },
});

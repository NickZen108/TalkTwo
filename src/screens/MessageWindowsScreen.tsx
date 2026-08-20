import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { detectedDeviceTimezone, normalizeIanaTimezone, normalizeMessageWindow } from '../domain/messageWindows';
import { getMyTimezone, listMyWindows, saveMyWindow, setMyTimezone, type MessageWindow } from '../services/windows';
import { useAppTheme, type AppColors } from '../theme/AppTheme';
import { useI18n } from '../i18n/I18nContext';

const DAY_KEYS = ['windows.sunday', 'windows.monday', 'windows.tuesday', 'windows.wednesday', 'windows.thursday', 'windows.friday', 'windows.saturday'] as const;

type Draft = { enabled: boolean; start: string; end: string };

function defaultDraft(day: number): Draft {
  const weekend = day === 0 || day === 6;
  return { enabled: !weekend, start: '08:00', end: '18:00' };
}

function initialDrafts(): Record<number, Draft> {
  return Object.fromEntries(DAY_KEYS.map((_, day) => [day, defaultDraft(day)])) as Record<number, Draft>;
}

export default function MessageWindowsScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useAppTheme();
  const { t } = useI18n();
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
        Alert.alert(t('windows.loadError'), error instanceof Error ? error.message : t('common.tryAgain'));
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
      Alert.alert(t('windows.checkWindow'), error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setBusyDay(null);
    }
  }

  async function saveTimezone(nextValue = timezone) {
    try {
      const normalized = normalizeIanaTimezone(nextValue);
      if (!normalized) {
        Alert.alert(t('windows.checkTimezone'), t('windows.validTimezone'));
        return;
      }
      setTimezoneBusy(true);
      const saved = await setMyTimezone(normalized);
      setTimezone(saved);
      Alert.alert(t('windows.timezoneSaved'), t('windows.timezoneSavedBody'));
    } catch (error) {
      Alert.alert(t('windows.timezoneSaveError'), error instanceof Error ? error.message : t('windows.timezoneSaveErrorBody'));
    } finally {
      setTimezoneBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('windows.backLabel')} onPress={onBack} style={styles.backButton}><Text style={styles.back}>{t('common.back')}</Text></TouchableOpacity>
          <Text style={styles.title}>{t('windows.title')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>{t('windows.timezoneTitle')}</Text>
          <Text style={styles.help}>{t('windows.timezoneHelp', { timezone: deviceTimezone })}</Text>
          <TextInput accessibilityLabel={t('windows.timezoneLabel')} value={timezone} onChangeText={setTimezone} autoCapitalize="none" autoCorrect={false} style={styles.input} placeholder="Europe/Copenhagen" placeholderTextColor={colors.subtle} />
          {timezone !== deviceTimezone ? (
            <TouchableOpacity accessibilityRole="button" onPress={() => void saveTimezone(deviceTimezone)} disabled={timezoneBusy} style={[styles.secondaryButton, timezoneBusy && styles.disabled]}>
              <Text style={styles.secondaryButtonText}>{t('windows.usePhoneTimezone')}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity accessibilityRole="button" onPress={() => void saveTimezone()} disabled={timezoneBusy} style={[styles.button, timezoneBusy && styles.disabled]}>
            <Text style={styles.buttonText}>{timezoneBusy ? t('windows.saving') : t('windows.saveTimezone')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>{t('windows.scheduleTitle')}</Text>
          <Text style={styles.help}>{t('windows.scheduleHelp')}</Text>

          {DAY_KEYS.map((key, day) => {
            const name = t(key);
            const draft = drafts[day] ?? defaultDraft(day);
            return (
              <View key={name} style={styles.dayRow}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayName}>{name}</Text>
                  <Switch accessibilityLabel={t('windows.windowLabel', { day: name })} accessibilityRole="switch" value={draft.enabled} onValueChange={(enabled) => setDrafts((old) => ({ ...old, [day]: { ...(old[day] ?? defaultDraft(day)), enabled } }))} />
                </View>
                {draft.enabled ? (
                  <View style={styles.timeRow}>
                    <TextInput accessibilityLabel={t('windows.openingLabel', { day: name })} value={draft.start} onChangeText={(start) => setDrafts((old) => ({ ...old, [day]: { ...(old[day] ?? defaultDraft(day)), start } }))} style={styles.timeInput} keyboardType="numbers-and-punctuation" maxLength={5} />
                    <Text style={styles.to}>{t('windows.to')}</Text>
                    <TextInput accessibilityLabel={t('windows.closingLabel', { day: name })} value={draft.end} onChangeText={(end) => setDrafts((old) => ({ ...old, [day]: { ...(old[day] ?? defaultDraft(day)), end } }))} style={styles.timeInput} keyboardType="numbers-and-punctuation" maxLength={5} />
                  </View>
                ) : <Text style={styles.closed}>{t('windows.closed')}</Text>}
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('windows.saveLabel', { day: name })} onPress={() => void saveDay(day)} disabled={busyDay === day} style={styles.saveDay}>
                  <Text style={styles.saveDayText}>{busyDay === day ? t('windows.saving') : t('windows.save')}</Text>
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

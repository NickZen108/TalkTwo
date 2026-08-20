import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ACCOUNT_DELETE_CONFIRMATION, accountDeleteConfirmed } from '../domain/accountDeletion';
import { deleteAccount } from '../services/auth';
import { disablePushNotifications, enablePushNotifications, pushNotificationStatus } from '../services/pushNotifications';
import { useAppTheme, type AppColors } from '../theme/AppTheme';
import { saveAccountLocalePreference, useI18n, type LocalePreference } from '../i18n/I18nContext';

export default function AccountScreen({
  userId,
  relationshipIds,
  onBack,
}: {
  userId: string;
  relationshipIds: string[];
  onBack: () => void;
}) {
  const { colors } = useAppTheme();
  const { t, systemLocale, preference, setPreference } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<string>('undetermined');
  const [pushBusy, setPushBusy] = useState(false);
  const confirmed = accountDeleteConfirmed(confirmation);

  useEffect(() => {
    void pushNotificationStatus()
      .then((status) => { setPushEnabled(status.enabled); setPushPermission(status.permission); })
      .catch(() => undefined);
  }, []);

  async function setPush(next: boolean) {
    try {
      setPushBusy(true);
      if (next) await enablePushNotifications();
      else await disablePushNotifications();
      const status = await pushNotificationStatus();
      setPushEnabled(status.enabled);
      setPushPermission(status.permission);
    } catch (error) {
      Alert.alert('Notifications', error instanceof Error ? error.message : 'Notification settings could not be changed.');
    } finally {
      setPushBusy(false);
    }
  }

  async function changeLanguage(next: LocalePreference) {
    try {
      const resolved = next === 'system' ? systemLocale : next;
      await saveAccountLocalePreference(next, resolved);
      await setPreference(next);
    } catch (error) {
      Alert.alert('Language', error instanceof Error ? error.message : t('common.tryAgain'));
    }
  }

  function confirmDeletion() {
    if (!confirmed || deleting) return;
    Alert.alert(
      'Permanently delete account?',
      'This cannot be undone. Your TalkTwo account, memberships, settings and server-side message data involving your account will be deleted.',
      [
        { text: 'Keep account', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            void deleteAccount(userId, relationshipIds)
              .catch((error) => Alert.alert('Account deletion', error instanceof Error ? error.message : 'The account could not be deleted. Please try again.'))
              .finally(() => setDeleting(false));
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>{t('account.back')}</Text>
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('account.title')}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('account.languageTitle')}</Text>
          <Text style={styles.body}>{t('account.languageHelp')}</Text>
          <View style={styles.languageOptions}>
            {(['system', 'en', 'da'] as LocalePreference[]).map((item) => (
              <TouchableOpacity key={item} accessibilityRole="radio" accessibilityState={{ checked: preference === item }} onPress={() => void changeLanguage(item)} style={[styles.languageOption, preference === item && styles.languageOptionSelected]}>
                <Text style={styles.languageOptionText}>{t(item === 'system' ? 'language.system' : item === 'en' ? 'language.english' : 'language.danish')}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('account.notificationsTitle')}</Text>
          <Text style={styles.body}>{t('account.notificationsBody')}</Text>
          <Text style={styles.body}>{t('account.permission', { permission: pushPermission })}</Text>
          <TouchableOpacity
            accessibilityRole="switch"
            accessibilityState={{ checked: pushEnabled, disabled: pushBusy }}
            disabled={pushBusy}
            onPress={() => void setPush(!pushEnabled)}
            style={[styles.notificationButton, pushEnabled && styles.notificationButtonEnabled, pushBusy && styles.disabled]}
          >
            <Text style={styles.notificationButtonText}>{pushBusy ? t('account.updating') : pushEnabled ? t('account.notificationsOn') : t('account.notificationsOff')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('account.deleteTitle')}</Text>
          <Text style={styles.body}>{t('account.deleteBody1')}</Text>
          <Text style={styles.body}>{t('account.deleteBody2')}</Text>
          <Text style={styles.body}>{t('account.deleteBody3')}</Text>
          <Text style={styles.warning}>{t('account.deleteWarning')}</Text>
          <Text style={styles.label}>{t('account.deleteType', { confirmation: ACCOUNT_DELETE_CONFIRMATION })}</Text>
          <TextInput
            accessibilityLabel={`Type ${ACCOUNT_DELETE_CONFIRMATION} to confirm account deletion`}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!deleting}
            onChangeText={setConfirmation}
            placeholder={ACCOUNT_DELETE_CONFIRMATION}
            placeholderTextColor={colors.subtle}
            style={styles.input}
            value={confirmation}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: !confirmed || deleting }}
            disabled={!confirmed || deleting}
            onPress={confirmDeletion}
            style={[styles.deleteButton, (!confirmed || deleting) && styles.disabled]}
          >
            <Text style={styles.deleteText}>{deleting ? t('account.deleting') : t('account.deleteButton')}</Text>
          </TouchableOpacity>
        </View>
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
    headerText: { flex: 1, minWidth: 0 },
    title: { color: colors.text, fontWeight: '800', fontSize: 21, flexShrink: 1 },
    card: { margin: 14, padding: 16, borderRadius: 16, gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', flexShrink: 1 },
    body: { color: colors.muted, lineHeight: 20, flexShrink: 1 },
    warning: { color: colors.danger, lineHeight: 20, fontWeight: '700', flexShrink: 1 },
    label: { color: colors.text, fontWeight: '700', marginTop: 4 },
    input: { minHeight: 46, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, color: colors.text, backgroundColor: colors.surfaceSoft },
    deleteButton: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger },
    deleteText: { color: colors.accentText, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
    notificationButton: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
    notificationButtonEnabled: { backgroundColor: colors.accentStrong },
    notificationButtonText: { color: colors.accentText, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
    languageOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    languageOption: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSoft },
    languageOptionSelected: { borderColor: colors.accent, borderWidth: 2 },
    languageOptionText: { color: colors.text, fontWeight: '700' },
    disabled: { opacity: 0.4 },
  });
}

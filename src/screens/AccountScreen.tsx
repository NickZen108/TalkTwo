import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ACCOUNT_DELETE_CONFIRMATION, accountDeleteConfirmed } from '../domain/accountDeletion';
import { deleteAccount } from '../services/auth';
import { getMyCoachSettings, setMyCoachEnabled, type CoachSettings } from '../services/coach';
import { disablePushNotifications, enablePushNotifications, pushNotificationStatus } from '../services/pushNotifications';
import { useAppTheme, type AppColors } from '../theme/AppTheme';
import { getCoachCopy } from '../i18n/coachCopy';
import { getPublicInfoCopy } from '../i18n/legalCopy';
import { saveAccountLocalePreference, useI18n, type LocalePreference } from '../i18n/I18nContext';
import { talkTwoPublicSiteLinks } from '../lib/publicSite';

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
  const { t, locale, systemLocale, preference, setPreference } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const coachCopy = useMemo(() => getCoachCopy(locale), [locale]);
  const publicInfoCopy = useMemo(() => getPublicInfoCopy(locale), [locale]);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<string>('undetermined');
  const [pushBusy, setPushBusy] = useState(false);
  const [coach, setCoach] = useState<CoachSettings | null>(null);
  const [coachBusy, setCoachBusy] = useState(false);
  const confirmed = accountDeleteConfirmed(confirmation);
  const coachEffective = Boolean(coach?.enabled && coach?.premium_active);

  useEffect(() => {
    void pushNotificationStatus()
      .then((status) => { setPushEnabled(status.enabled); setPushPermission(status.permission); })
      .catch(() => undefined);
    void getMyCoachSettings().then(setCoach).catch(() => undefined);
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
      Alert.alert(t('account.notificationsError'), error instanceof Error ? error.message : t('account.notificationsErrorBody'));
    } finally {
      setPushBusy(false);
    }
  }

  async function toggleCoach() {
    if (!coach || coachBusy) return;
    const next = !coach.enabled;
    if (next && !coach.premium_active) {
      Alert.alert(coachCopy.unavailableTitle, coachCopy.unavailableBody);
      return;
    }
    try {
      setCoachBusy(true);
      await setMyCoachEnabled(next);
      setCoach(await getMyCoachSettings());
    } catch (error) {
      const message = error instanceof Error ? error.message : coachCopy.unavailableBody;
      Alert.alert(coachCopy.unavailableTitle, message.toLowerCase().includes('premium') ? coachCopy.unavailableBody : message);
    } finally {
      setCoachBusy(false);
    }
  }

  async function changeLanguage(next: LocalePreference) {
    try {
      const resolved = next === 'system' ? systemLocale : next;
      await saveAccountLocalePreference(next, resolved);
      await setPreference(next);
    } catch (error) {
      Alert.alert(t('account.languageError'), error instanceof Error ? error.message : t('common.tryAgain'));
    }
  }

  async function openPublicLink(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(publicInfoCopy.openErrorTitle, publicInfoCopy.openErrorBody);
    }
  }

  function confirmDeletion() {
    if (!confirmed || deleting) return;
    Alert.alert(
      t('account.confirmDeleteTitle'),
      t('account.confirmDeleteBody'),
      [
        { text: t('account.keep'), style: 'cancel' },
        {
          text: t('account.deletePermanently'),
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            void deleteAccount(userId, relationshipIds)
              .catch((error) => Alert.alert(t('account.deleteError'), error instanceof Error ? error.message : t('account.deleteErrorBody')))
              .finally(() => setDeleting(false));
          },
        },
      ],
    );
  }

  const coachButtonLabel = coachBusy
    ? coachCopy.updating
    : coach?.enabled && !coach.premium_active
      ? coachCopy.paused
      : coachEffective
        ? coachCopy.on
        : coachCopy.off;

  const publicLinks = talkTwoPublicSiteLinks ? [
    { label: publicInfoCopy.privacy, url: talkTwoPublicSiteLinks.privacy },
    { label: publicInfoCopy.terms, url: talkTwoPublicSiteLinks.terms },
    { label: publicInfoCopy.support, url: talkTwoPublicSiteLinks.support },
    { label: publicInfoCopy.deleteAccount, url: talkTwoPublicSiteLinks.deleteAccount },
  ] : [];

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
          <Text style={styles.body}>{t('account.permission', { permission: t(pushPermission === 'granted' ? 'account.permissionGranted' : pushPermission === 'denied' ? 'account.permissionDenied' : 'account.permissionUndetermined') })}</Text>
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
          <Text style={styles.sectionTitle}>{coachCopy.title}</Text>
          <Text style={styles.body}>{coachCopy.help}</Text>
          <TouchableOpacity
            accessibilityRole="switch"
            accessibilityState={{ checked: coachEffective, disabled: coachBusy || !coach }}
            disabled={coachBusy || !coach}
            onPress={() => void toggleCoach()}
            style={[styles.coachButton, coachEffective && styles.coachButtonEnabled, coachBusy && styles.disabled]}
          >
            <Text style={styles.coachButtonText}>{coachButtonLabel}</Text>
          </TouchableOpacity>
          {!coach?.premium_active ? <Text style={styles.premiumNote}>{coachCopy.unavailableBody}</Text> : null}
          {coach?.premium_active ? (
            <View style={styles.statsWrap}>
              <Text style={styles.statsTitle}>{coachCopy.statsTitle}</Text>
              {coach.reviewed_attempts > 0 ? (
                <View style={styles.statsGrid}>
                  <View style={styles.statCell}><Text style={styles.statValue}>{coach.reviewed_attempts}</Text><Text style={styles.statLabel}>{coachCopy.reviewed}</Text></View>
                  <View style={styles.statCell}><Text style={styles.statValue}>{coach.green_count}</Text><Text style={styles.statLabel}>{coachCopy.green}</Text></View>
                  <View style={styles.statCell}><Text style={styles.statValue}>{coach.yellow_count}</Text><Text style={styles.statLabel}>{coachCopy.yellow}</Text></View>
                  <View style={styles.statCell}><Text style={styles.statValue}>{coach.red_count}</Text><Text style={styles.statLabel}>{coachCopy.blocked}</Text></View>
                  <View style={styles.statCell}><Text style={styles.statValue}>{coach.blocked_percentage}%</Text><Text style={styles.statLabel}>{coachCopy.blockedRate}</Text></View>
                </View>
              ) : <Text style={styles.body}>{coachCopy.noReviews}</Text>}
            </View>
          ) : null}
          <Text style={styles.privacyNote}>{coachCopy.privacy}</Text>
        </View>

        {publicLinks.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{publicInfoCopy.title}</Text>
            <Text style={styles.body}>{publicInfoCopy.help}</Text>
            {publicLinks.map((item) => (
              <TouchableOpacity key={item.url} accessibilityRole="link" onPress={() => void openPublicLink(item.url)} style={styles.publicLinkButton}>
                <Text style={styles.publicLinkText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('account.deleteTitle')}</Text>
          <Text style={styles.body}>{t('account.deleteBody1')}</Text>
          <Text style={styles.body}>{t('account.deleteBody2')}</Text>
          <Text style={styles.body}>{t('account.deleteBody3')}</Text>
          <Text style={styles.warning}>{t('account.deleteWarning')}</Text>
          <Text style={styles.label}>{t('account.deleteType', { confirmation: ACCOUNT_DELETE_CONFIRMATION })}</Text>
          <TextInput
            accessibilityLabel={t('account.deleteAccessibility', { confirmation: ACCOUNT_DELETE_CONFIRMATION })}
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
    premiumNote: { color: colors.noticeText, backgroundColor: colors.notice, borderRadius: 10, padding: 10, lineHeight: 19, flexShrink: 1 },
    privacyNote: { color: colors.subtle, fontSize: 12, lineHeight: 17, flexShrink: 1 },
    label: { color: colors.text, fontWeight: '700', marginTop: 4 },
    input: { minHeight: 46, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, color: colors.text, backgroundColor: colors.surfaceSoft },
    deleteButton: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger },
    deleteText: { color: colors.accentText, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
    notificationButton: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
    notificationButtonEnabled: { backgroundColor: colors.accentStrong },
    notificationButtonText: { color: colors.accentText, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
    coachButton: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
    coachButtonEnabled: { backgroundColor: colors.accentStrong },
    coachButtonText: { color: colors.accentText, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
    publicLinkButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.borderStrong },
    publicLinkText: { color: colors.accent, fontWeight: '800', flexShrink: 1 },
    statsWrap: { gap: 9, paddingTop: 2 },
    statsTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statCell: { minWidth: 92, flexGrow: 1, flexBasis: 92, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: colors.surfaceSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    statValue: { color: colors.text, fontSize: 18, fontWeight: '800' },
    statLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
    languageOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    languageOption: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSoft },
    languageOptionSelected: { borderColor: colors.accent, borderWidth: 2 },
    languageOptionText: { color: colors.text, fontWeight: '700' },
    disabled: { opacity: 0.4 },
  });
}

import React, { useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ACCOUNT_DELETE_CONFIRMATION, accountDeleteConfirmed } from '../domain/accountDeletion';
import { deleteAccount } from '../services/auth';
import { useAppTheme, type AppColors } from '../theme/AppTheme';

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
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const confirmed = accountDeleteConfirmed(confirmation);

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
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Account & privacy</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Delete TalkTwo account</Text>
          <Text style={styles.body}>Deletion removes your account, profile, chat memberships, settings and server-side messages involving your account. It also removes this account's decrypted local messages and conversation keys from this device.</Text>
          <Text style={styles.body}>Other people may still have messages they already opened on their own devices. TalkTwo cannot remotely erase private data stored on somebody else's phone.</Text>
          <Text style={styles.body}>Deleting TalkTwo does not cancel an Apple App Store or Google Play subscription. Cancel an active subscription in the store to stop future charges.</Text>
          <Text style={styles.warning}>This is permanent. A new account using the same email will not recover deleted chats or encryption keys.</Text>
          <Text style={styles.label}>Type {ACCOUNT_DELETE_CONFIRMATION} to continue</Text>
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
            <Text style={styles.deleteText}>{deleting ? 'Deleting account…' : 'Delete account permanently'}</Text>
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
    disabled: { opacity: 0.4 },
  });
}

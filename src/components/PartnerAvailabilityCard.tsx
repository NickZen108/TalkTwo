import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { listRelationshipMembers, type RelationshipMember } from '../services/relationships';
import {
  listMyMemberBlocks,
  listMyNotificationMutes,
  setMemberBlockDuration,
  setMyNotificationMute,
  type BlockMinutes,
  type MemberBlock,
  type NotificationMute,
} from '../services/privacyControls';
import { useAppTheme, type AppColors } from '../theme/AppTheme';

function copy(locale: 'en' | 'da') {
  return locale === 'da' ? {
    title: 'Ro og privatliv',
    help: 'Dine valg her er private. Andre kan ikke se, om du har slået notifikationer fra eller blokeret dem.',
    appHelp: 'Du kan slå alle TalkTwo-notifikationer fra under Konto og privatliv. Beskeder bliver stadig modtaget, når de bliver tilgængelige.',
    chatOn: 'Notifikationer fra denne chat: Til',
    chatOff: 'Notifikationer fra denne chat: Fra',
    personOn: 'Notifikationer: Til',
    personOff: 'Notifikationer: Fra',
    block: 'Blokér',
    oneHour: '1 time',
    fourHours: '4 timer',
    day: '24 timer',
    until: 'Indtil jeg ophæver',
    unblock: 'Fjern blokering',
    blockedUntil: (value: string | null) => value
      ? `Blokeret indtil ${new Date(value).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' })}`
      : 'Blokeret indtil du ophæver',
    error: 'Indstillingen kunne ikke gemmes',
  } : {
    title: 'Calm & privacy',
    help: 'Your choices here are private. Other people cannot see whether you muted notifications or blocked them.',
    appHelp: 'You can turn off all TalkTwo notifications in Account & privacy. Messages are still received when they become available.',
    chatOn: 'Notifications from this chat: On',
    chatOff: 'Notifications from this chat: Off',
    personOn: 'Notifications: On',
    personOff: 'Notifications: Off',
    block: 'Block',
    oneHour: '1 hour',
    fourHours: '4 hours',
    day: '24 hours',
    until: 'Until I unblock',
    unblock: 'Unblock',
    blockedUntil: (value: string | null) => value
      ? `Blocked until ${new Date(value).toLocaleString('en', { dateStyle: 'short', timeStyle: 'short' })}`
      : 'Blocked until you unblock',
    error: 'The setting could not be saved',
  };
}

function SmallButton({ title, onPress, active = false, danger = false, disabled = false, styles }: {
  title: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, active && styles.buttonActive, danger && styles.buttonDanger, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  );
}

export default function PartnerAvailabilityCard({ relationshipId, myUserId }: { relationshipId: string; myUserId: string }) {
  const { colors } = useAppTheme();
  const { locale } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const c = useMemo(() => copy(locale), [locale]);
  const [members, setMembers] = useState<RelationshipMember[]>([]);
  const [mutes, setMutes] = useState<NotificationMute[]>([]);
  const [blocks, setBlocks] = useState<MemberBlock[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const [nextMembers, nextMutes, nextBlocks] = await Promise.all([
      listRelationshipMembers(relationshipId),
      listMyNotificationMutes(relationshipId),
      listMyMemberBlocks(relationshipId),
    ]);
    setMembers(nextMembers.filter((member) => member.user_id !== myUserId));
    setMutes(nextMutes);
    setBlocks(nextBlocks);
    setLoaded(true);
  }

  useEffect(() => {
    void refresh().catch(() => setLoaded(true));
  }, [relationshipId, myUserId]);

  const chatMuted = mutes.some((item) => item.relationship_id === relationshipId && item.sender_id === null);
  const blockMap = useMemo(() => new Map(blocks.map((item) => [item.blocked_user_id, item])), [blocks]);

  async function save(action: () => Promise<unknown>) {
    try {
      setBusy(true);
      await action();
      await refresh();
    } catch (error) {
      Alert.alert(c.error, error instanceof Error ? error.message : c.error);
    } finally {
      setBusy(false);
    }
  }

  function setChatMuted(muted: boolean) {
    void save(() => setMyNotificationMute({ relationshipId, muted }));
  }

  function setPersonMuted(userId: string, muted: boolean) {
    void save(() => setMyNotificationMute({ senderId: userId, muted }));
  }

  function setBlock(userId: string, minutes: BlockMinutes) {
    void save(() => setMemberBlockDuration(relationshipId, userId, true, minutes));
  }

  function removeBlock(userId: string) {
    void save(() => setMemberBlockDuration(relationshipId, userId, false));
  }

  if (!loaded) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{c.title}</Text>
      <Text style={styles.help}>{c.help}</Text>
      <SmallButton
        styles={styles}
        title={chatMuted ? c.chatOff : c.chatOn}
        active={!chatMuted}
        onPress={() => setChatMuted(!chatMuted)}
        disabled={busy}
      />

      {members.map((member) => {
        const personMuted = mutes.some((item) => item.sender_id === member.user_id);
        const block = blockMap.get(member.user_id) ?? null;
        return (
          <View key={member.user_id} style={styles.personCard}>
            <Text style={styles.personName}>{member.display_name}</Text>
            <SmallButton
              styles={styles}
              title={personMuted ? c.personOff : c.personOn}
              active={!personMuted}
              onPress={() => setPersonMuted(member.user_id, !personMuted)}
              disabled={busy}
            />
            {block ? (
              <>
                <Text style={styles.status}>{c.blockedUntil(block.expires_at)}</Text>
                <SmallButton styles={styles} title={c.unblock} onPress={() => removeBlock(member.user_id)} danger disabled={busy} />
              </>
            ) : (
              <>
                <Text style={styles.smallLabel}>{c.block}</Text>
                <View style={styles.row}>
                  <SmallButton styles={styles} title={c.oneHour} onPress={() => setBlock(member.user_id, 60)} disabled={busy} />
                  <SmallButton styles={styles} title={c.fourHours} onPress={() => setBlock(member.user_id, 240)} disabled={busy} />
                  <SmallButton styles={styles} title={c.day} onPress={() => setBlock(member.user_id, 1440)} disabled={busy} />
                  <SmallButton styles={styles} title={c.until} onPress={() => setBlock(member.user_id, null)} danger disabled={busy} />
                </View>
              </>
            )}
          </View>
        );
      })}
      <Text style={styles.note}>{c.appHelp}</Text>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 16,
      gap: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    title: { color: colors.text, fontSize: 18, fontWeight: '800', flexShrink: 1 },
    help: { color: colors.muted, lineHeight: 20, flexShrink: 1 },
    note: { color: colors.subtle, lineHeight: 18, fontSize: 12, flexShrink: 1 },
    personCard: { gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    personName: { color: colors.text, fontWeight: '800', fontSize: 15, flexShrink: 1 },
    smallLabel: { color: colors.muted, fontWeight: '700', fontSize: 12 },
    status: { color: colors.muted, lineHeight: 18 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    button: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.borderStrong },
    buttonActive: { borderColor: colors.accent, borderWidth: 2 },
    buttonDanger: { borderColor: colors.danger },
    buttonText: { color: colors.text, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
    disabled: { opacity: 0.4 },
  });
}

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { buildPartnerAvailability } from '../domain/partnerAvailability';
import { partnerAvailabilityHeading, partnerAvailabilityText } from '../i18n/partnerAvailabilityCopy';
import { useI18n } from '../i18n/I18nContext';
import { listRelationshipMembers } from '../services/relationships';
import { getPartnerWindows, type PartnerWindow } from '../services/windows';
import { useAppTheme, type AppColors } from '../theme/AppTheme';

export default function PartnerAvailabilityCard({ relationshipId, myUserId }: { relationshipId: string; myUserId: string }) {
  const { colors } = useAppTheme();
  const { locale, t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [rows, setRows] = useState<PartnerWindow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => new Date());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getPartnerWindows(relationshipId),
      listRelationshipMembers(relationshipId),
    ]).then(([windows, members]) => {
      if (!active) return;
      setRows(windows);
      setNames(Object.fromEntries(
        members
          .filter((member) => member.user_id !== myUserId)
          .map((member) => [member.user_id, member.display_name.trim() || t('chat.member')]),
      ));
      setLoaded(true);
    }).catch(() => {
      if (active) setLoaded(true);
    });
    return () => { active = false; };
  }, [relationshipId, myUserId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const availability = useMemo(() => buildPartnerAvailability(rows, now), [rows, now]);
  if (!loaded || availability.length === 0) return null;

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.title}>{partnerAvailabilityHeading(locale)}</Text>
      {availability.map((item) => (
        <Text key={item.userId} style={styles.line}>
          {partnerAvailabilityText(item, names[item.userId] ?? t('chat.member'), locale)}
        </Text>
      ))}
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 16,
      gap: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    title: { color: colors.text, fontSize: 18, fontWeight: '800', flexShrink: 1 },
    line: { color: colors.muted, lineHeight: 20, flexShrink: 1 },
  });
}

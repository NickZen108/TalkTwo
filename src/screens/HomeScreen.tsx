import React, { useEffect, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { signOut } from '../services/auth';
import { acceptInvitation, createInvitation, listRelationships, type RelationshipSummary } from '../services/relationships';
import { releaseWaitingMessages } from '../services/windows';
import ChatScreen from './ChatScreen';
import MessageWindowsScreen from './MessageWindowsScreen';

function Button({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text></TouchableOpacity>;
}

export default function HomeScreen({ session, pendingInvite, clearPendingInvite }: { session: Session; pendingInvite: string | null; clearPendingInvite: () => void }) {
  const [relationships, setRelationships] = useState<RelationshipSummary[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<RelationshipSummary | null>(null);
  const [showWindows, setShowWindows] = useState(false);

  async function refreshRelationships() {
    try { setRelationships(await listRelationships()); }
    catch (error) { Alert.alert('Could not load connections', error instanceof Error ? error.message : 'Please try again.'); }
  }

  useEffect(() => { void refreshRelationships(); }, []);
  useEffect(() => { if (pendingInvite) setInviteCode(pendingInvite); }, [pendingInvite]);

  async function makeInvite() {
    try {
      setBusy(true);
      const invite = await createInvitation();
      await Share.share({ message: `I have invited you to TalkTwo. Open this link on your phone after installing TalkTwo: talktwo://invite/${invite.token}` });
      await refreshRelationships();
    } catch (error) {
      Alert.alert('Could not create invitation', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  async function joinWithCode() {
    try {
      setBusy(true);
      await acceptInvitation(inviteCode);
      setInviteCode('');
      clearPendingInvite();
      await refreshRelationships();
      Alert.alert('Connected', 'This TalkTwo connection is now active.');
    } catch (error) {
      Alert.alert('Invitation not accepted', error instanceof Error ? error.message : 'Check the invitation and try again.');
    } finally { setBusy(false); }
  }

  async function checkWaiting() {
    try {
      setBusy(true);
      const count = await releaseWaitingMessages();
      Alert.alert(count > 0 ? 'Waiting messages available' : 'Nothing waiting', count > 0 ? `${count} message${count === 1 ? '' : 's'} can now be opened. Choose the relevant connection to read them.` : 'There are no messages waiting outside your current message window.');
    } catch (error) {
      Alert.alert('Could not check waiting messages', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  if (selected) return <ChatScreen relationship={selected} session={session} onBack={() => setSelected(null)} />;
  if (showWindows) return <MessageWindowsScreen onBack={() => setShowWindows(false)} />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View><Text style={styles.brand}>TalkTwo</Text><Text style={styles.tagline}>{session.user.email}</Text></View>
          <TouchableOpacity onPress={() => void signOut()}><Text style={styles.signOut}>Sign out</Text></TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Connections</Text>
          <Text style={styles.help}>Each connection is a separate private conversation.</Text>
          {relationships.map((rel, index) => (
            <TouchableOpacity key={rel.id} onPress={() => setSelected(rel)} style={styles.connectionRow}>
              <View><Text style={styles.connectionTitle}>Connection {index + 1}</Text><Text style={styles.help}>{rel.status === 'active' ? 'Active' : rel.status}</Text></View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
          {relationships.length === 0 ? <Text style={styles.help}>No active connections yet.</Text> : null}
          <Button title={busy ? 'Please wait…' : 'Invite someone'} onPress={() => void makeInvite()} disabled={busy} />
          {inviteCode ? <View style={styles.inviteNotice}><Text style={styles.connectionTitle}>Invitation ready</Text><Text style={styles.help}>Accepting connects this account to the person who sent the invitation.</Text><Button title="Accept invitation" onPress={() => void joinWithCode()} disabled={busy} secondary /></View> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Your quiet hours</Text>
          <Text style={styles.help}>Set the hours when new messages may appear. Outside them, TalkTwo stays quiet unless you choose to look.</Text>
          <Button title="Set message windows" onPress={() => setShowWindows(true)} secondary />
          <Button title="Check waiting messages" onPress={() => void checkWaiting()} disabled={busy} />
        </View>

        <View style={styles.premiumCard}>
          <Text style={styles.premiumTitle}>Premium</Text>
          <Text style={styles.premiumText}>AI review, calm rewrites, Coach, longer messages, Personal Boundaries and PDF export will sit on top of the same communication rules.</Text>
          <View style={styles.greyFeature}><Text style={styles.greyTitle}>Personal Boundaries</Text><Text style={styles.greyText}>Choose words you do not want to receive. Premium only.</Text></View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F2' },
  container: { padding: 22, gap: 16 },
  headerRow: { marginTop: 16, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontSize: 34, fontWeight: '800', color: '#161616' },
  tagline: { marginTop: 4, fontSize: 14, color: '#666' },
  signOut: { fontWeight: '700', color: '#555' },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E5E5E0', gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#161616' },
  help: { color: '#666', lineHeight: 20 },
  connectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#ECECE8' },
  connectionTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  chevron: { fontSize: 28, color: '#777' },
  inviteNotice: { gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ECECE8' },
  button: { backgroundColor: '#171717', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' },
  secondary: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CFCFC9' },
  disabled: { opacity: 0.3 },
  buttonText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  secondaryText: { color: '#222' },
  premiumCard: { padding: 18, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: '#B9B9B2', gap: 10 },
  premiumTitle: { fontSize: 15, fontWeight: '800', color: '#333' },
  premiumText: { color: '#666', lineHeight: 20 },
  greyFeature: { opacity: 0.45, borderTopWidth: 1, borderTopColor: '#CFCFC9', paddingTop: 12 },
  greyTitle: { fontWeight: '800', color: '#333' },
  greyText: { marginTop: 4, color: '#666' },
});

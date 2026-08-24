import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

const DB_KEY_NAME = 'talktwo.localdb.key.v1';
const DB_NAME = 'talktwo-local.db';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function databaseKey() {
  const stored = await SecureStore.getItemAsync(DB_KEY_NAME, secureOptions);
  if (stored && /^[0-9a-f]{64}$/i.test(stored)) return stored;
  const created = bytesToHex(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(DB_KEY_NAME, created, secureOptions);
  return created;
}

async function assertSqlCipher(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version;');
  if (!row?.cipher_version?.trim()) {
    try {
      await db.closeAsync();
    } catch {
      // The important invariant is to fail closed before any local plaintext table is used.
    }
    throw new Error('Encrypted local storage is unavailable on this build.');
  }
}

async function openDatabase() {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  const key = await databaseKey();
  await db.execAsync(`PRAGMA key = '${key}';`);
  await assertSqlCipher(db);
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS local_messages (
      owner_user_id TEXT NOT NULL,
      relationship_id TEXT NOT NULL,
      message_key TEXT NOT NULL,
      logical_id TEXT NOT NULL,
      server_row_id TEXT,
      sender_id TEXT NOT NULL,
      recipient_id TEXT,
      body TEXT NOT NULL,
      body_hash TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      created_at TEXT NOT NULL,
      edited_at TEXT,
      rejected_at TEXT,
      reject_reason TEXT,
      PRIMARY KEY (owner_user_id, relationship_id, message_key)
    );
    CREATE INDEX IF NOT EXISTS local_messages_thread_time
      ON local_messages(owner_user_id, relationship_id, created_at);

    CREATE TABLE IF NOT EXISTS conversation_preferences (
      owner_user_id TEXT NOT NULL,
      relationship_id TEXT NOT NULL,
      background_theme TEXT NOT NULL DEFAULT 'paper',
      PRIMARY KEY (owner_user_id, relationship_id)
    );

    CREATE TABLE IF NOT EXISTS member_preferences (
      owner_user_id TEXT NOT NULL,
      relationship_id TEXT NOT NULL,
      member_user_id TEXT NOT NULL,
      local_alias TEXT,
      bubble_theme TEXT NOT NULL DEFAULT 'sage',
      PRIMARY KEY (owner_user_id, relationship_id, member_user_id)
    );
  `);
  return db;
}

export function getLocalDatabase() {
  if (!databasePromise) databasePromise = openDatabase();
  return databasePromise;
}

export interface CachedMessageInput {
  ownerUserId: string;
  relationshipId: string;
  messageKey: string;
  logicalId: string;
  serverRowId: string | null;
  senderId: string;
  recipientId: string | null;
  body: string;
  bodyHash: string;
  ciphertext: string;
  riskLevel: 'green' | 'yellow';
  createdAt: string;
  editedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
}

export async function cacheMessage(input: CachedMessageInput) {
  const db = await getLocalDatabase();
  await db.runAsync(
    `INSERT INTO local_messages (
      owner_user_id, relationship_id, message_key, logical_id, server_row_id,
      sender_id, recipient_id, body, body_hash, ciphertext, risk_level,
      created_at, edited_at, rejected_at, reject_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_user_id, relationship_id, message_key) DO UPDATE SET
      logical_id=excluded.logical_id, server_row_id=excluded.server_row_id,
      sender_id=excluded.sender_id, recipient_id=excluded.recipient_id,
      body=excluded.body, body_hash=excluded.body_hash, ciphertext=excluded.ciphertext,
      risk_level=excluded.risk_level, created_at=excluded.created_at,
      edited_at=excluded.edited_at, rejected_at=excluded.rejected_at,
      reject_reason=excluded.reject_reason`,
    input.ownerUserId, input.relationshipId, input.messageKey, input.logicalId, input.serverRowId,
    input.senderId, input.recipientId, input.body, input.bodyHash, input.ciphertext, input.riskLevel,
    input.createdAt, input.editedAt, input.rejectedAt, input.rejectReason,
  );
}

export interface CachedMessageRow {
  message_key: string;
  logical_id: string;
  server_row_id: string | null;
  sender_id: string;
  recipient_id: string | null;
  body: string;
  body_hash: string;
  ciphertext: string;
  risk_level: 'green' | 'yellow';
  created_at: string;
  edited_at: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
}

export async function listCachedMessages(ownerUserId: string, relationshipId: string) {
  const db = await getLocalDatabase();
  return db.getAllAsync<CachedMessageRow>(
    `SELECT message_key, logical_id, server_row_id, sender_id, recipient_id, body,
      body_hash, ciphertext, risk_level, created_at, edited_at, rejected_at, reject_reason
     FROM local_messages WHERE owner_user_id=? AND relationship_id=? ORDER BY created_at, message_key`,
    ownerUserId,
    relationshipId,
  );
}

export async function removeCachedMessage(ownerUserId: string, relationshipId: string, logicalId: string) {
  const db = await getLocalDatabase();
  await db.runAsync(
    'DELETE FROM local_messages WHERE owner_user_id=? AND relationship_id=? AND logical_id=?',
    ownerUserId, relationshipId, logicalId,
  );
}

export async function getConversationTheme(ownerUserId: string, relationshipId: string) {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<{ background_theme: string }>(
    'SELECT background_theme FROM conversation_preferences WHERE owner_user_id=? AND relationship_id=?',
    ownerUserId,
    relationshipId,
  );
  return row?.background_theme ?? 'paper';
}

export async function setConversationTheme(ownerUserId: string, relationshipId: string, theme: string) {
  const db = await getLocalDatabase();
  await db.runAsync(
    `INSERT INTO conversation_preferences(owner_user_id,relationship_id,background_theme) VALUES(?,?,?)
     ON CONFLICT(owner_user_id,relationship_id) DO UPDATE SET background_theme=excluded.background_theme`,
    ownerUserId, relationshipId, theme,
  );
}

export interface MemberPreference {
  member_user_id: string;
  local_alias: string | null;
  bubble_theme: string;
}

export async function listMemberPreferences(ownerUserId: string, relationshipId: string) {
  const db = await getLocalDatabase();
  return db.getAllAsync<MemberPreference>(
    'SELECT member_user_id,local_alias,bubble_theme FROM member_preferences WHERE owner_user_id=? AND relationship_id=?',
    ownerUserId,
    relationshipId,
  );
}

export async function setMemberPreference(ownerUserId: string, relationshipId: string, memberUserId: string, localAlias: string | null, bubbleTheme: string) {
  const db = await getLocalDatabase();
  await db.runAsync(
    `INSERT INTO member_preferences(owner_user_id,relationship_id,member_user_id,local_alias,bubble_theme) VALUES(?,?,?,?,?)
     ON CONFLICT(owner_user_id,relationship_id,member_user_id) DO UPDATE SET local_alias=excluded.local_alias,bubble_theme=excluded.bubble_theme`,
    ownerUserId, relationshipId, memberUserId, localAlias?.trim() || null, bubbleTheme,
  );
}

export async function clearLocalAccountData(userId: string) {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM local_messages WHERE owner_user_id=? OR sender_id=? OR recipient_id=?',
      userId, userId, userId,
    );
    await db.runAsync(
      'DELETE FROM member_preferences WHERE owner_user_id=? OR member_user_id=?',
      userId, userId,
    );
    await db.runAsync('DELETE FROM conversation_preferences WHERE owner_user_id=?', userId);
  });
}

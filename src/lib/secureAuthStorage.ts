import * as SecureStore from 'expo-secure-store';

const PREFIX = 'talktwo.auth.v1.';
const CHUNK_SIZE = 1500;
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

type Meta = { version: string; count: number };

function storageBase(key: string) {
  return `${PREFIX}${key}`;
}

function metaKey(key: string) {
  return `${storageBase(key)}.meta`;
}

function chunkKey(key: string, version: string, index: number) {
  return `${storageBase(key)}.${version}.${index}`;
}

function parseMeta(raw: string | null): Meta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Meta>;
    if (typeof parsed.version === 'string' && parsed.version && Number.isInteger(parsed.count) && (parsed.count ?? 0) > 0 && (parsed.count ?? 0) < 100) {
      return { version: parsed.version, count: parsed.count as number };
    }
  } catch {
    // Damaged secure state is treated as signed out rather than exposed elsewhere.
  }
  return null;
}

async function removeVersion(key: string, meta: Meta | null) {
  if (!meta) return;
  await Promise.all(Array.from({ length: meta.count }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, meta.version, index), secureOptions).catch(() => undefined)));
}

export const secureAuthStorage = {
  async getItem(key: string) {
    const meta = parseMeta(await SecureStore.getItemAsync(metaKey(key), secureOptions));
    if (!meta) return null;
    const chunks = await Promise.all(Array.from({ length: meta.count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, meta.version, index), secureOptions)));
    if (chunks.some((chunk) => chunk === null)) return null;
    return chunks.join('');
  },

  async setItem(key: string, value: string) {
    const previous = parseMeta(await SecureStore.getItemAsync(metaKey(key), secureOptions));
    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'gs')) ?? [''];
    const version = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

    for (let index = 0; index < chunks.length; index += 1) {
      await SecureStore.setItemAsync(chunkKey(key, version, index), chunks[index] ?? '', secureOptions);
    }

    await SecureStore.setItemAsync(metaKey(key), JSON.stringify({ version, count: chunks.length }), secureOptions);
    await removeVersion(key, previous);
  },

  async removeItem(key: string) {
    const previous = parseMeta(await SecureStore.getItemAsync(metaKey(key), secureOptions));
    await SecureStore.deleteItemAsync(metaKey(key), secureOptions);
    await removeVersion(key, previous);
  },
};

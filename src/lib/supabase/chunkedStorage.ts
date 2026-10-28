type KeyValueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

type Manifest = { version: string; count: number };

function manifest(raw: string | null): Manifest | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Manifest;
    return typeof value.version === 'string' && /^[a-z0-9-]+$/.test(value.version) &&
      Number.isInteger(value.count) && value.count > 0 && value.count <= 2048 ? value : null;
  } catch {
    return null;
  }
}

// Small chunks avoid SecureStore's platform payload limit. Publish the pointer last.
// Supabase processLock serializes operations for the same auth client.
export function createChunkedStorage(storage: KeyValueStorage): KeyValueStorage {
  const chunkKey = (key: string, value: Manifest, index: number) => `${key}.${value.version}.${index}`;
  const removeChunks = async (key: string, value: Manifest | null) => {
    if (value) await Promise.all(Array.from({ length: value.count }, (_, index) => storage.removeItem(chunkKey(key, value, index))));
  };
  return {
    async getItem(key) {
      const value = manifest(await storage.getItem(key));
      if (!value) return null;
      const chunks = await Promise.all(Array.from({ length: value.count }, (_, index) => storage.getItem(chunkKey(key, value, index))));
      return chunks.some((chunk) => chunk === null) ? null : chunks.join('');
    },
    async setItem(key, data) {
      const previous = manifest(await storage.getItem(key));
      const encoded = encodeURIComponent(data);
      const chunks = encoded.match(/.{1,1500}/g) ?? [''];
      if (chunks.length > 2048) throw new Error('인증 세션 저장 크기를 초과했습니다.');
      const next = { version: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, count: chunks.length };
      try {
        // Await every write before cleanup so failed writes cannot leave late orphans.
        const writes = await Promise.allSettled(chunks.map((chunk, index) => storage.setItem(chunkKey(key, next, index), chunk)));
        if (writes.some((write) => write.status === 'rejected')) throw new Error('인증 세션을 저장하지 못했습니다.');
        await storage.setItem(key, JSON.stringify(next));
      } catch (error) {
        await removeChunks(key, next);
        throw error;
      }
      await removeChunks(key, previous);
    },
    async removeItem(key) {
      const previous = manifest(await storage.getItem(key));
      await storage.removeItem(key);
      await removeChunks(key, previous);
    },
  };
}

export function decodeChunkedStorage(storage: KeyValueStorage): KeyValueStorage {
  const chunks = createChunkedStorage(storage);
  return {
    ...chunks,
    async getItem(key) {
      const value = await chunks.getItem(key);
      if (value === null) return null;
      try { return decodeURIComponent(value); } catch { return null; }
    },
  };
}

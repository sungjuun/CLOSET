import { describe, expect, it } from 'vitest';
import { decodeChunkedStorage } from '../src/lib/supabase/chunkedStorage';

function fixture() {
  const values = new Map<string, string>();
  const raw = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
  };
  return { values, raw, storage: decodeChunkedStorage(raw) };
}

describe('native encrypted storage chunk adapter', () => {
  it('roundtrips large Unicode sessions in bounded chunks and removes all keys', async () => {
    const { values, storage } = fixture();
    const session = JSON.stringify({ metadata: '한글 옷장 😀'.repeat(1000) });
    await storage.setItem('auth', session);
    expect([...values.values()].every((value) => new TextEncoder().encode(value).byteLength <= 1500)).toBe(true);
    expect(await storage.getItem('auth')).toBe(session);
    await storage.setItem('auth', 'replacement');
    expect(await storage.getItem('auth')).toBe('replacement');
    expect(values.size).toBe(2);
    await storage.removeItem('auth');
    expect(values.size).toBe(0);
  });
  it('keeps the previous session if a chunk write fails', async () => {
    const { raw, values, storage } = fixture();
    await storage.setItem('auth', 'previous');
    const failing = decodeChunkedStorage({ ...raw, setItem: async (key, value) => {
      if (key.endsWith('.1')) throw new Error('device storage failed');
      await raw.setItem(key, value);
    } });
    await expect(failing.setItem('auth', 'x'.repeat(4000))).rejects.toThrow();
    expect(await storage.getItem('auth')).toBe('previous');
    expect(values.size).toBe(2);
  });
  it('fails closed when chunks or manifest are missing', async () => {
    const { values, storage } = fixture();
    await storage.setItem('auth', 'x'.repeat(4000));
    const chunk = [...values.keys()].find((key) => key.endsWith('.1'))!;
    values.delete(chunk);
    expect(await storage.getItem('auth')).toBeNull();
    values.set('auth', 'corrupt');
    expect(await storage.getItem('auth')).toBeNull();
  });
});

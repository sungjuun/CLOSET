import { preferencesSchema, type WeatherPreferences } from './model';

export const weatherPreferenceKey = (owner: string) => `closet.weather.${owner.replace(/[^a-zA-Z0-9._-]/g, (char) => `_${char.codePointAt(0)}_`)}`;
export function readWeatherPreferences(raw: string | null): WeatherPreferences | null {
  if (!raw) return null;
  try { const parsed = preferencesSchema.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : null; }
  catch { return null; }
}

type Storage = { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void> };
export function createWeatherPreferenceStore(storage: Storage) {
  // AppShell can remount on navigation. Finish pending writes before restoring
  // preferences, and serialize each account independently across those mounts.
  const pending = new Map<string, Promise<void>>();
  return {
    async load(owner: string) {
      const key = weatherPreferenceKey(owner);
      await pending.get(key)?.catch(() => {});
      return readWeatherPreferences(await storage.get(key));
    },
    save(owner: string, preferences: WeatherPreferences) {
      const key = weatherPreferenceKey(owner);
      const value = JSON.stringify(preferencesSchema.parse(preferences));
      const write = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(() => storage.set(key, value));
      pending.set(key, write);
      const cleanup = () => { if (pending.get(key) === write) pending.delete(key); };
      void write.then(cleanup, cleanup);
      return write;
    },
  };
}

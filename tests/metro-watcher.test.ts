import { createRequire } from 'node:module';
import { win32 } from 'node:path';
import { expect, it } from 'vitest';

const { normalizeWatcherPath } = createRequire(import.meta.url)('../scripts/patch-metro-watcher.cjs') as {
  normalizeWatcherPath: (directory: string, reported: string, paths: typeof win32) => string | null;
};

it('maps removed watched directories back to themselves so their watcher can close', () => {
  const directory = 'C:\\work\\성준\\closet\\dist';
  const reported = '\\\\?\\C:\\work\\성준\\closet\\dist';
  expect(win32.join(directory, reported)).not.toBe(directory);
  expect(normalizeWatcherPath(directory, reported, win32)).toBe('');
});
it('keeps ordinary events and namespaced child file events relative to the watcher', () => {
  expect(normalizeWatcherPath('C:\\work\\src', 'Icon.tsx', win32)).toBe('Icon.tsx');
  expect(normalizeWatcherPath('C:\\work\\src', '\\\\?\\C:\\work\\src\\ui\\Icon.tsx', win32)).toBe('ui\\Icon.tsx');
  expect(normalizeWatcherPath('\\\\server\\share\\src', '\\\\?\\UNC\\server\\share\\src\\Icon.tsx', win32)).toBe('Icon.tsx');
});
it('ignores events outside the watched directory, including other drives', () => {
  expect(normalizeWatcherPath('C:\\work\\src', 'C:\\outside\\file.ts', win32)).toBeNull();
  expect(normalizeWatcherPath('C:\\work\\src', '..\\other.ts', win32)).toBeNull();
  expect(normalizeWatcherPath('C:\\work\\src', 'D:\\file.ts', win32)).toBeNull();
});

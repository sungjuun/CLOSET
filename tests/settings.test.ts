import { describe, expect, it, vi } from 'vitest';
import { createSettingsStore } from '../src/features/settings/store';
import { createThemeController } from '../src/features/settings/controller';
import type { ThemeName } from '../src/theme/tokens';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  const store = createSettingsStore(); store.getState().scope('A');
  const service = { load: vi.fn(async (): Promise<ThemeName> => 'dark'), save: vi.fn(async (theme: ThemeName): Promise<ThemeName> => theme) };
  return { store, service, controller: createThemeController('A', service, store) };
}
describe('account theme synchronization', () => {
  it('restores saved preferences and previews a serialized automatic save', async () => {
    const { store, service, controller } = setup();
    await controller.load();
    expect(store.getState()).toMatchObject({ theme: 'dark', status: 'ready' });
    const result = deferred<ThemeName>(); service.save.mockImplementationOnce(() => result.promise);
    const saving = controller.select('beige');
    expect(store.getState()).toMatchObject({ theme: 'beige', status: 'saving' });
    await controller.select('white'); // A second press cannot send a competing write.
    await controller.load(); // A focus refresh cannot replace an in-flight choice.
    expect(service.save).toHaveBeenCalledTimes(1);
    expect(service.load).toHaveBeenCalledTimes(1);
    result.resolve('beige'); await saving;
    expect(store.getState()).toMatchObject({ theme: 'beige', status: 'ready', error: null });
    controller.dispose();
  });
  it('does not write defaults before hydration and reloads after a failed read', async () => {
    const { store, service, controller } = setup();
    await controller.select('white'); expect(service.save).not.toHaveBeenCalled();
    service.load.mockRejectedValueOnce(new Error('offline'));
    await controller.load();
    expect(store.getState()).toMatchObject({ status: 'error', theme: 'white' });
    await controller.select('beige'); expect(service.save).not.toHaveBeenCalled();
    await controller.load();
    expect(store.getState()).toMatchObject({ status: 'ready', theme: 'dark' });
    controller.dispose();
  });
  it('reports failed saves, restores the confirmed display and reconciles an uncertain commit', async () => {
    const { store, service, controller } = setup(); await controller.load();
    service.save.mockRejectedValueOnce(new Error('response lost'));
    await controller.select('beige');
    expect(store.getState()).toMatchObject({ theme: 'dark', status: 'error' });
    expect(store.getState().error).toContain('저장 결과');
    service.load.mockResolvedValueOnce('beige'); await controller.load();
    expect(store.getState()).toMatchObject({ theme: 'beige', status: 'ready', error: null });
    controller.dispose();
  });
  it('clears member colors at logout and rejects late writes across A → B → A', async () => {
    const { store, service, controller } = setup(); await controller.load();
    const result = deferred<ThemeName>(); service.save.mockImplementationOnce(() => result.promise);
    const saving = controller.select('beige');
    store.getState().scope(null);
    expect(store.getState()).toMatchObject({ owner: null, theme: 'white', status: 'idle' });
    store.getState().scope('B'); store.getState().scope('A');
    result.resolve('beige'); await saving;
    expect(store.getState()).toMatchObject({ owner: 'A', theme: 'white', status: 'loading' });
    controller.dispose();
  });
  it('ignores replaced loads and disposed controllers even if transport ignores abort', async () => {
    const { store, service, controller } = setup();
    const older = deferred<ThemeName>(); service.load.mockImplementationOnce(() => older.promise);
    const pending = controller.load();
    await controller.load(); older.resolve('beige'); await pending;
    expect(store.getState().theme).toBe('dark');
    const later = deferred<ThemeName>(); service.load.mockImplementationOnce(() => later.promise);
    const loading = controller.load(); controller.dispose(); later.resolve('white'); await loading;
    expect(store.getState().theme).toBe('dark');
  });
  it('keeps the saved theme when a fresh controller represents an app restart', async () => {
    const { service, controller } = setup(); await controller.load(); await controller.select('beige'); controller.dispose();
    const freshStore = createSettingsStore(); freshStore.getState().scope('A');
    service.load.mockResolvedValueOnce('beige');
    const fresh = createThemeController('A', service, freshStore); await fresh.load();
    expect(freshStore.getState().theme).toBe('beige'); fresh.dispose();
  });
});

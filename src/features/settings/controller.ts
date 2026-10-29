import type { ThemeName } from '../../theme/tokens';
import type { createThemeService } from './service';
import type { createSettingsStore } from './store';

// One controller lives for the authenticated identity, across screen changes.
export function createThemeController(owner: string, service: ReturnType<typeof createThemeService>, store: ReturnType<typeof createSettingsStore>) {
  const generation = store.getState().generation;
  let active = true;
  let revision = 0;
  let saving = false;
  let confirmed: ThemeName | null = null;
  let request: AbortController | null = null;
  const current = () => active && store.getState().owner === owner && store.getState().generation === generation;
  async function perform(mode: 'load' | 'save', theme?: ThemeName) {
    if (!current() || saving || (mode === 'save' && (confirmed === null || store.getState().status !== 'ready'))) return;
    const version = ++revision;
    request?.abort();
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    saving = mode === 'save';
    store.setState({ status: saving ? 'saving' : 'loading', error: null, ...(theme ? { theme } : {}) });
    try {
      const value = mode === 'load' ? await service.load(controller.signal) : await service.save(theme!, controller.signal);
      if (!current() || revision !== version) return;
      confirmed = value;
      store.setState({ theme: value, status: 'ready', error: null });
    } catch {
      if (current() && revision === version) store.setState({
        theme: confirmed ?? 'white', status: 'error', error: mode === 'load'
          ? '저장된 테마를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.'
          : '테마 저장 결과를 확인하지 못했어요. 다시 불러온 뒤 선택해 주세요.',
      });
    } finally {
      clearTimeout(timeout);
      if (revision === version) { saving = false; request = null; }
    }
  }
  return {
    load: () => perform('load'),
    select: (theme: ThemeName) => {
      if (theme === confirmed && store.getState().status === 'ready') return Promise.resolve();
      return perform('save', theme);
    },
    dispose: () => { active = false; revision++; request?.abort(); },
  };
}

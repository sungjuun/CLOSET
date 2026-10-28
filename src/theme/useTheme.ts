import { useSettingsStore } from '@/features/settings/store';
import { themes } from './tokens';

export function useTheme() {
  return themes[useSettingsStore((state) => state.theme)];
}

import { create } from 'zustand';
import type { ThemeName } from '@/theme/tokens';

export const useSettingsStore = create<{
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}>((set) => ({
  theme: 'white',
  setTheme: (theme) => set({ theme }),
}));

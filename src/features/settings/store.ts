import { create } from 'zustand';
import type { ThemeName } from '../../theme/tokens';

export type SettingsState = {
  owner: string | null;
  generation: number;
  theme: ThemeName;
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error';
  error: string | null;
  scope: (owner: string | null) => void;
};
export const createSettingsStore = () => create<SettingsState>((set) => ({
  owner: null,
  generation: 0,
  theme: 'white',
  status: 'idle',
  error: null,
  scope: (owner) => set((previous) => previous.owner === owner ? previous : {
    owner, generation: previous.generation + 1, theme: 'white', status: owner ? 'loading' : 'idle', error: null,
  }),
}));
export const useSettingsStore = createSettingsStore();

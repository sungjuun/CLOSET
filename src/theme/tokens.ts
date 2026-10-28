export const themeNames = ['white', 'beige', 'brown'] as const;
export type ThemeName = (typeof themeNames)[number];

const shared = {
  primary: '#3047D5',
  onPrimary: '#FFFFFF',
  text: '#222530',
  muted: '#7C818E',
  border: '#E6E7ED',
};

export const themes = {
  white: { ...shared, background: '#FFFFFF', surface: '#F5F6F9', photo: '#C2C3C6', board: '#E9ECF3' },
  beige: { ...shared, background: '#FAF6EE', surface: '#F0E8DB', photo: '#D3CDC3', board: '#EDE5D8' },
  brown: { ...shared, background: '#F4ECE5', surface: '#E8DACD', photo: '#C5B7AB', board: '#E2D5CB', text: '#382B24' },
} satisfies Record<ThemeName, typeof shared & { background: string; surface: string; photo: string; board: string }>;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const radius = { card: 12, control: 10 };
export const desktopBreakpoint = 1024;

export function wardrobeColumns(width: number): 2 | 3 | 4 | 5 {
  if (width >= 1200) return 5;
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  return 2;
}

import Svg, { Path } from 'react-native-svg';

const paths = {
  hanger: 'M12 9V7a3 3 0 1 1 3-3M12 9 2.5 16a1.7 1.7 0 0 0 1 3h17a1.7 1.7 0 0 0 1-3L12 9Z',
  shirt: 'm8 3-5 3-2 5 4 2 1-3v11h12V10l1 3 4-2-2-5-5-3c0 4-8 4-8 0Z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  layers: 'm12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5',
  sparkles: 'm14 3 2.5 6.5L23 12l-6.5 2.5L14 21l-2.5-6.5L5 12l6.5-2.5L14 3ZM4 2v5M1.5 4.5h5M4 17v5M1.5 19.5h5',
  memo: 'M8 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3M9 4h5M9 8h3M7 2v4M7 10v4M7 18v4m5-7 2-5 6-6 3 3-6 6-5 2Z',
  heart: 'M20.8 4.8a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-9.4a5.5 5.5 0 0 0 0-7.8Z',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  plus: 'M12 4v16M4 12h16',
  chevron: 'm6 9 6 6 6-6',
  filters: 'M4 5h16M7 12h10M10 19h4',
  refresh: 'M3 10a9 9 0 1 1 2 8M3 3v7h7',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2M17 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  close: 'm6 6 12 12M6 18 18 6',
  calendar: 'M3 5h18v16H3V5ZM7 2v6M17 2v6M3 10h18',
  chart: 'M4 3v18h17M8 16v-4M13 16V8M18 16V4',
} as const;
export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, color = '#858995', filled = false }: { name: IconName; size?: number; color?: string; filled?: boolean }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden><Path d={paths[name]} /></Svg>;
}

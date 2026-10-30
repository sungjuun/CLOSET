import type { IconName } from '@/components/ui/Icon';

export const desktopRoutes = [
  { href: '/wardrobe', label: '내 옷장', icon: 'shirt' },
  { href: '/outfits', label: '저장한 코디', icon: 'bookmark' },
  { href: '/outfits/new', label: '코디 만들기', icon: 'layers' },
  { href: '/recommendations', label: '코디 추천', icon: 'sparkles' },
  { href: '/color-combinations', label: '색상 조합', icon: 'palette' },
  { href: '/style-guide', label: '스타일 가이드', icon: 'book' },
  { href: '/settings', label: '설정', icon: 'settings' },
] as const satisfies readonly { href: string; label: string; icon: IconName }[];
export const moreRoutes = desktopRoutes.slice(4);
export const mobileRoutes = [...desktopRoutes.slice(0, 4), { href: '/more', label: '더보기', icon: 'more' }] as const;

export function isNavigationActive(href: string, pathname: string): boolean {
  if (href === '/more') return pathname === '/more' || moreRoutes.some(route => isNavigationActive(route.href, pathname));
  if (href === '/outfits') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

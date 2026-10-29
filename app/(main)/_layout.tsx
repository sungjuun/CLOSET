import { Redirect, Slot, useGlobalSearchParams, usePathname } from 'expo-router';
import { useAuth } from '@/providers/AppProviders';
import { SessionStatus } from '@/features/auth/SessionStatus';
import { selectionFromParams } from '@/features/color-combinations/finder';

export default function PrivateLayout() {
  const auth = useAuth();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const selection = selectionFromParams(params);
  if (auth.pending || auth.failed) return <SessionStatus />;
  if (!auth.userId) return <Redirect href={pathname === '/color-combinations' && (selection.top || selection.bottom) ? { pathname: '/login', params: { colorTop: selection.top ?? '', colorBottom: selection.bottom ?? '' } } : '/login'} />;
  if (auth.recoveryRequired) return <Redirect href="/auth/update-password" />;
  return <Slot />;
}

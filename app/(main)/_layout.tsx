import { Redirect, Slot } from 'expo-router';
import { useAuth } from '@/providers/AppProviders';
import { SessionStatus } from '@/features/auth/SessionStatus';

export default function PrivateLayout() {
  const auth = useAuth();
  if (auth.pending || auth.failed) return <SessionStatus />;
  if (!auth.userId) return <Redirect href="/login" />;
  if (auth.recoveryRequired) return <Redirect href="/auth/update-password" />;
  return <Slot />;
}

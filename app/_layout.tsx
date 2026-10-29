import { Slot } from 'expo-router';
import { ThemeAppearance } from '@/theme/ThemeAppearance';
import { AppShell } from '@/components/layout/AppShell';
import { AppProviders } from '@/providers/AppProviders';
import { NavigationGuardProvider } from '@/providers/NavigationGuard';

export default function RootLayout() {
  return (
    <AppProviders>
      <ThemeAppearance />
      <NavigationGuardProvider><AppShell><Slot /></AppShell></NavigationGuardProvider>
    </AppProviders>
  );
}

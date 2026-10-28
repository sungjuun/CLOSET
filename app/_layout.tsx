import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppShell } from '@/components/layout/AppShell';
import { AppProviders } from '@/providers/AppProviders';
import { NavigationGuardProvider } from '@/providers/NavigationGuard';

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <NavigationGuardProvider><AppShell><Slot /></AppShell></NavigationGuardProvider>
    </AppProviders>
  );
}

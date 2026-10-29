import { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from './useTheme';
import { themes } from './tokens';

export function ThemeAppearance() {
  const colors = useTheme();
  const dark = colors === themes.dark;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const root = document.documentElement;
    const previous = { scheme: root.style.colorScheme, background: root.style.backgroundColor, body: document.body.style.backgroundColor };
    const existing = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const meta = existing ?? document.createElement('meta');
    const previousContent = meta.content;
    if (!existing) { meta.name = 'theme-color'; document.head.appendChild(meta); }
    root.style.colorScheme = dark ? 'dark' : 'light';
    root.style.backgroundColor = colors.background;
    document.body.style.backgroundColor = colors.background;
    meta.content = colors.background;
    return () => {
      root.style.colorScheme = previous.scheme;
      root.style.backgroundColor = previous.background;
      document.body.style.backgroundColor = previous.body;
      if (existing) meta.content = previousContent; else meta.remove();
    };
  }, [colors.background, dark]);
  return <StatusBar style={dark ? 'light' : 'dark'} />;
}

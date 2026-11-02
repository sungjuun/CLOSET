import { useCallback } from 'react';
import { Platform, View } from 'react-native';
import { Captcha } from '@/features/auth/Captcha';

// A same-origin page for the native WebView. No credentials or sessions are passed.
export default function AuthChallenge() {
  const onToken = useCallback((token: string | null) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'closet-captcha', token }));
  }, []);
  return <View style={{ padding: 10, alignItems: 'center' }}><Captcha onToken={onToken} /></View>;
}

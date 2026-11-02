import { useState } from 'react';
import { Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '@/theme/useTheme';
import { ActionButton } from '@/components/ui/ActionButton';
import { authWebOrigin, turnstileSiteKey, type CaptchaProps } from './protection';

export function Captcha({ onToken }: CaptchaProps) {
  const colors = useTheme(); const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0); const origin = authWebOrigin();
  if (!turnstileSiteKey) return null;
  if (!origin) return <Text style={{ color: colors.danger }}>보안 확인을 연결하지 못했어요. 웹사이트에서 이용해 주세요.</Text>;
  const challenge = `${origin}/auth/challenge`;
  const allowed = (value: string) => { try { const url = new URL(value); return url.origin === origin && url.pathname === '/auth/challenge'; } catch { return false; } };
  return <View style={{ gap: 8 }}><View style={{ width: '100%', height: 170 }}><WebView key={attempt} source={{ uri: challenge }} originWhitelist={[origin, 'https://challenges.cloudflare.com', 'about:*']} javaScriptEnabled domStorageEnabled scrollEnabled={false} onShouldStartLoadWithRequest={request => request.isTopFrame ? allowed(request.url) || request.url === 'about:blank' : true} onLoadStart={() => onToken(null)} onError={() => { onToken(null); setFailed(true); }} onHttpError={() => { onToken(null); setFailed(true); }} onMessage={event => {
    if (!allowed(event.nativeEvent.url)) return;
    try { const message = JSON.parse(event.nativeEvent.data); if (message.type !== 'closet-captcha') return; if (message.token === null || (typeof message.token === 'string' && message.token.length > 0 && message.token.length <= 4096)) { setFailed(false); onToken(message.token); } } catch { onToken(null); }
  }} /></View>{failed && <><Text style={{ color: colors.danger }}>보안 확인을 불러오지 못했어요.</Text><ActionButton label="보안 확인 다시 시도" onPress={() => { setFailed(false); setAttempt(value => value + 1); }} /></>}</View>;
}

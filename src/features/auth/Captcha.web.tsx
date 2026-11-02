import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { ActionButton } from '@/components/ui/ActionButton';
import { turnstileSiteKey, type CaptchaProps } from './protection';

type Turnstile = { render: (container: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: Turnstile; ReactNativeWebView?: { postMessage: (value: string) => void } } }
let pending: Promise<Turnstile> | null = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!pending) pending = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; script.defer = true;
    const failed = () => { clearTimeout(timeout); script.remove(); pending = null; reject(new Error('captcha_unavailable')); };
    const timeout = setTimeout(failed, 15_000);
    script.onerror = failed; script.onload = () => { clearTimeout(timeout); if (window.turnstile) resolve(window.turnstile); else failed(); };
    document.head.appendChild(script);
  });
  return pending;
}
export function Captcha({ onToken }: CaptchaProps) {
  const colors = useTheme(); const host = useRef<HTMLDivElement>(null); const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!turnstileSiteKey) return;
    let active = true; let widget: string | undefined; let api: Turnstile | undefined;
    onToken(null);
    void loadTurnstile().then(value => {
      if (!active || !host.current) return; api = value;
      widget = value.render(host.current, { sitekey: turnstileSiteKey, size: 'compact', language: 'ko', theme: 'auto', callback: (token: string) => { if (active) { setFailed(false); onToken(token); } }, 'expired-callback': () => { if (active) onToken(null); }, 'timeout-callback': () => { if (active) { onToken(null); setFailed(true); } }, 'error-callback': () => { if (active) { onToken(null); setFailed(true); } } });
    }).catch(() => { if (active) { onToken(null); setFailed(true); } });
    return () => { active = false; if (widget) api?.remove(widget); };
  }, [attempt, onToken]);
  if (!turnstileSiteKey) return null;
  return <View style={{ gap: 8, alignItems: 'flex-start', minHeight: 140 }}><div ref={host} aria-label="자동 가입 방지 보안 확인" />{failed && <><Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 12 }}>보안 확인을 완료하지 못했어요. 연결을 확인하고 다시 시도해 주세요.</Text><ActionButton label="보안 확인 다시 시도" variant="secondary" onPress={() => { setFailed(false); onToken(null); setAttempt(value => value + 1); }} /></>}</View>;
}

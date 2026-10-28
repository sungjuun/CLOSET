import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { PhotoPlaceholder } from '../components';
import type { PrivatePhoto } from './model';
import { Icon } from '@/components/ui/Icon';

export function PhotoFrame({ photo, loading = false, error = false, retry, catalog = false, aspectRatio = 1 }: { photo: PrivatePhoto | null; loading?: boolean; error?: boolean; retry?: (() => void) | undefined; catalog?: boolean; aspectRatio?: number }) {
  const colors = useTheme();
  const [failedUrl,setFailedUrl] = useState<string | null>(null);
  const [attempt,setAttempt] = useState(0);
  if (!photo && !loading && !error) return catalog ? <View accessibilityLabel="사진 미등록" style={{ width: '100%', aspectRatio, borderRadius: 10, backgroundColor: colors.photo, alignItems: 'center', justifyContent: 'center', gap: 10 }}><Icon name="hanger" size={42} color="#FFFFFF" /><Text style={{ color: colors.text, opacity: 0.65, fontSize: 11 }}>사진 미등록</Text></View> : <PhotoPlaceholder aspectRatio={aspectRatio} />;
  const url = photo?.signedUrl;
  const failed = error || (photo && (!url || failedUrl === url));
  return <View style={{ width: '100%', aspectRatio, backgroundColor: catalog ? colors.photo : colors.surface, borderRadius: catalog ? 10 : 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
    {url && !failed ? <Image key={attempt} accessibilityLabel="의류 사진" source={{ uri: url }} resizeMode="contain" style={{ width: '100%', height: '100%' }} onError={() => setFailedUrl(url)} /> : <View style={{ padding: 12, gap: 8 }}><Text style={{ color: colors.muted, fontSize: 12 }}>{failed ? '사진을 불러오지 못했어요' : '사진 확인 중…'}</Text>{failed && retry && <Pressable accessibilityRole="button" onPress={() => { setFailedUrl(null); setAttempt((value) => value + 1); retry(); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary }}>사진 다시 불러오기</Text></Pressable>}</View>}
  </View>;
}

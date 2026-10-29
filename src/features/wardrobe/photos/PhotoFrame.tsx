import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { PhotoPlaceholder } from '../components';
import type { PrivatePhoto } from './model';
import { Icon } from '@/components/ui/Icon';
import { PhotoBackdrop } from './PhotoBackdrop';

export function PhotoFrame({ photo, loading = false, error = false, retry, catalog = false, aspectRatio = 1, naturalAspect = false }: { photo: PrivatePhoto | null; loading?: boolean; error?: boolean; retry?: (() => void) | undefined; catalog?: boolean; aspectRatio?: number; naturalAspect?: boolean }) {
  const colors = useTheme();
  const [failedUrl,setFailedUrl] = useState<string | null>(null);
  const [attempt,setAttempt] = useState(0);
  const [dimensions,setDimensions] = useState<{ path: string; ratio: number } | null>(null);
  const url = photo?.signedUrl;
  const path = photo?.storage_path;
  useEffect(() => {
    if (!naturalAspect || !url || !path || dimensions?.path === path) return;
    let active = true;
    Image.getSize(url, (width, height) => {
      if (active && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) setDimensions({ path, ratio: width / height });
    }, () => { /* Keep the entire image visible in the fallback frame. */ });
    return () => { active = false; };
  }, [naturalAspect, url, path, attempt, dimensions?.path]);
  const frameRatio = naturalAspect && dimensions && dimensions.path === path ? dimensions.ratio : aspectRatio;
  if (!photo && !loading && !error) return catalog ? <View accessibilityLabel="사진 미등록" style={{ width: '100%', aspectRatio, borderRadius: 10, backgroundColor: colors.photo, alignItems: 'center', justifyContent: 'center', gap: 10 }}><Icon name="hanger" size={42} color="#FFFFFF" /><Text style={{ color: colors.text, opacity: 0.65, fontSize: 11 }}>사진 미등록</Text></View> : <PhotoPlaceholder aspectRatio={aspectRatio} />;
  const failed = error || (photo && (!url || failedUrl === url));
  return <View style={{ width: '100%', aspectRatio: frameRatio, maxHeight: naturalAspect ? 720 : undefined, backgroundColor: url && !failed ? colors.surface : catalog ? colors.photo : colors.surface, borderRadius: catalog ? 10 : 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
    {url && !failed && !naturalAspect && <PhotoBackdrop url={url} />}
    {url && !failed ? <Image key={attempt} accessibilityLabel="의류 사진" source={{ uri: url }} resizeMode="contain" style={{ width: '100%', height: '100%' }} onError={() => setFailedUrl(url)} /> : <View style={{ padding: 12, gap: 8 }}><Text style={{ color: colors.muted, fontSize: 12 }}>{failed ? '사진을 불러오지 못했어요' : '사진 확인 중…'}</Text>{failed && retry && <Pressable accessibilityRole="button" onPress={() => { setFailedUrl(null); setAttempt((value) => value + 1); retry(); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary }}>사진 다시 불러오기</Text></Pressable>}</View>}
  </View>;
}

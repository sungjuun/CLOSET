import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';

export function BrandLogo({ name, url, size = 44 }: { name: string; url?: string | undefined; size?: number }) {
  const colors = useTheme();
  const [failed, setFailed] = useState<string | null>(null);
  return <View style={{ width: size, height: size, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    {url && failed !== url ? <Image accessibilityLabel={`${name} 브랜드 이미지`} source={{ uri: url }} resizeMode="cover" style={{ width: '100%', height: '100%' }} onError={() => setFailed(url)} /> : <Text accessibilityLabel={`${name || '미선택'} 이미지 없음`} numberOfLines={2} style={{ color: colors.muted, fontSize: size < 40 ? 9 : 12, textAlign: 'center', padding: 3 }}>{name.slice(0, 10) || '—'}</Text>}
  </View>;
}

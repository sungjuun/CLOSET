import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { useUserId } from '@/providers/AppProviders';
import { supabase } from '@/lib/supabase/client';
import { privateQueryKey } from '@/lib/query/keys';
import { useTheme } from '@/theme/useTheme';
import { ActionButton } from '@/components/ui/ActionButton';
import { formatMiB, readMemberUsage } from './model';

export function UsagePanel() {
  const colors = useTheme(); const owner = useUserId()!;
  const usage = useQuery({ queryKey: privateQueryKey(owner, 'account-usage', {}), queryFn: ({ signal }) => readMemberUsage(supabase!, owner, signal), gcTime: 0, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: 'always' });
  if (usage.isPending) return <Text style={{ color: colors.muted }}>사용량을 확인하는 중…</Text>;
  if (usage.isError) return <View style={{ gap: 12 }}><Text style={{ color: colors.danger }}>사용량을 불러오지 못했어요.</Text><ActionButton label="사용량 다시 확인" onPress={() => { void usage.refetch(); }} /></View>;
  const data = usage.data;
  const rows = [{ name: '등록한 의류', used: data.wardrobe_count, max: data.wardrobe_limit, value: `${data.wardrobe_count} / ${data.wardrobe_limit}개` }, { name: '이미지 저장 공간', used: data.media_bytes, max: data.media_bytes_limit, value: `${formatMiB(data.media_bytes)} / ${formatMiB(data.media_bytes_limit)}` }, { name: '저장한 이미지', used: data.media_files, max: data.media_files_limit, value: `${data.media_files} / ${data.media_files_limit}개` }];
  return <View style={{ gap: 18 }}>{rows.map(row => <View key={row.name} style={{ gap: 8 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}><Text style={{ color: colors.text, fontSize: 13 }}>{row.name}</Text><Text style={{ color: colors.muted, fontSize: 13 }}>{row.value}</Text></View><View accessibilityRole="progressbar" accessibilityLabel={row.name} aria-valuemin={0} aria-valuemax={row.max} aria-valuenow={Math.min(row.used, row.max)} aria-valuetext={row.value} accessibilityValue={{ min: 0, max: row.max, now: Math.min(row.used, row.max), text: row.value }} style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}><View style={{ height: '100%', width: `${Math.min(100, row.used / row.max * 100)}%`, backgroundColor: row.used >= row.max ? colors.danger : colors.primary }} /></View></View>)}<Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>휴지통의 옷도 등록 개수에 포함됩니다. 저장 공간은 서버에 보관된 의류 사진·브랜드 로고·코디 이미지를 합산합니다.</Text></View>;
}

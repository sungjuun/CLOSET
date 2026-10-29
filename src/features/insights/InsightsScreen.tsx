import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { FormField } from '@/components/ui/FormField';
import { SearchField } from '@/components/ui/SearchField';
import { useTheme } from '@/theme/useTheme';
import { Choice, WardrobeHeader, WardrobeState } from '../wardrobe/components';
import { lifecycleLabels } from '../wardrobe/types';
import { PhotoFrame } from '../wardrobe/photos/PhotoFrame';
import { primaryPhoto } from '../wardrobe/photos/model';
import { usePhotos } from '../wardrobe/photos/hooks';
import { localCalendarDate } from '../wear/calendar';
import { wearDateSchema } from '../wear/model';
import { defaultInsightFilters, insightCostLabel, insightPageSize, insightRange, type InsightListFilters, type InsightScope } from './model';
import { formatWon } from '@/lib/format/money';
import { useInsightItems, useInsightSummary } from './queries';
import { insightErrorMessage } from './repository';

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  const colors = useTheme();
  return <View style={{ flexGrow: 1, flexBasis: 160, minWidth: 0, padding: 18, gap: 8, backgroundColor: colors.surface, borderRadius: 12 }}>
    <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text><Text style={{ color: colors.text, fontSize: 27, fontWeight: '700' }}>{value}</Text>{note && <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>{note}</Text>}
  </View>;
}
function Distribution({ title, groups, total, other = 0 }: { title: string; groups: { name: string | null; count: number }[]; total: number; other?: number }) {
  const colors = useTheme();
  return <View style={{ flexGrow: 1, flexBasis: 280, minWidth: 0, gap: 14, padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}>
    <Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>{title}</Text>
    {!groups.length ? <Text style={{ color: colors.muted }}>등록된 의류가 없어요.</Text> : groups.map((group, index) => <View key={`${group.name}:${index}`} style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}><Text style={{ color: colors.text, flex: 1 }} numberOfLines={2}>{group.name ?? '브랜드 미입력'}</Text><Text style={{ color: colors.muted }}>{group.count}벌 · {total ? Math.round(group.count / total * 100) : 0}%</Text></View>
      <View accessible={false} style={{ height: 7, backgroundColor: colors.surface, borderRadius: 4 }}><View style={{ height: 7, width: `${total ? Math.min(100, group.count / total * 100) : 0}%`, backgroundColor: colors.primary, borderRadius: 4 }} /></View>
    </View>)}
    {other > 0 && <Text style={{ color: colors.muted }}>그 외 브랜드 {other}벌</Text>}
  </View>;
}

const modes: { value: InsightListFilters['mode']; label: string }[] = [{ value: 'most', label: '많이 기록한 옷' }, { value: 'unrecorded', label: '기간 내 기록 없는 옷' }, { value: 'recent', label: '최근 등록' }, { value: 'all', label: '전체 의류' }];
export function InsightsScreen() {
  const colors = useTheme();
  const [state, setState] = useState<{ scope: InsightScope; filters: InsightListFilters; page: number }>(() => ({ scope: { asOf: localCalendarDate(), period: '30' }, filters: defaultInsightFilters, page: 0 }));
  const [dateText, setDateText] = useState(state.scope.asOf);
  const [dateError, setDateError] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  useEffect(() => { const timer = setTimeout(() => setState((previous) => previous.filters.search === search.trim() ? previous : { ...previous, page: 0, filters: { ...previous.filters, search: search.trim() } }), 350); return () => clearTimeout(timer); }, [search]);
  const summary = useInsightSummary(state.scope);
  const list = useInsightItems(state.page, state.scope, state.filters);
  const photos = usePhotos(list.data?.items.map((item) => item.item_id) ?? []);
  const range = insightRange(state.scope);
  const last = list.data ? Math.max(0, Math.ceil(list.data.total / insightPageSize) - 1) : state.page;
  if (state.page > last) setState({ ...state, page: last });
  function asOf(value: string) { const parsed = wearDateSchema.safeParse(value); if (!parsed.success) { setDateError('올바른 기준일을 YYYY-MM-DD로 입력해 주세요.'); return; } setState((previous) => ({ ...previous, page: 0, scope: { ...previous.scope, asOf: parsed.data } })); setDateText(parsed.data); setDateError(undefined); }
  const data = summary.data;
  return <View style={{ width: '100%', maxWidth: 1100, alignSelf: 'center', gap: 24 }}>
    <WardrobeHeader title="옷장 통계" description="기록으로 옷장의 활용을 살펴보세요." />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['30', '90', 'all'] as const).map((period) => <Choice key={period} label={period === 'all' ? '전체 기록' : `최근 ${period}일`} selected={state.scope.period === period} onPress={() => setState((previous) => ({ ...previous, page: 0, scope: { ...previous.scope, period } }))} />)}</View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
      <View style={{ flexGrow: 1, flexBasis: 200, maxWidth: 300 }}><FormField label="집계 기준일 (YYYY-MM-DD)" value={dateText} onChangeText={setDateText} maxLength={10} error={dateError} /></View>
      <ActionButton variant="secondary" label="기준일 적용" onPress={() => asOf(dateText)} /><ActionButton variant="secondary" label="오늘 기준" onPress={() => asOf(localCalendarDate())} />
      <ActionButton variant="secondary" label="통계 새로고침" disabled={summary.isFetching || list.isFetching} onPress={() => { void Promise.all([summary.refetch(), list.refetch(), photos.refetch()]); }} />
    </View>
    <Text style={{ color: colors.muted, lineHeight: 22 }}>{range.start ? `${range.start} ~ ${range.end} (양 끝 날짜 포함)` : `${range.end}까지의 전체 기록`}{'\n'}기준일 이후 날짜와 삭제한 기록은 제외합니다. 같은 날의 별도 기록은 각각 집계합니다.</Text>
    {summary.isPending ? <WardrobeState title="통계를 계산하는 중" message="잠시만 기다려 주세요." /> : summary.isError ? <WardrobeState title="통계를 불러오지 못했어요" message={insightErrorMessage(summary.error)} retry={() => { void summary.refetch(); }} /> : data && <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Metric label="현재 등록 의류" value={`${data.wardrobe.total}벌`} note="휴지통 제외 · 판매/기부 상태 포함" />
        <Metric label="기간 내 착용 기록" value={`${data.wear.events}개`} note={`${data.wear.days}일 · 의류 착용 ${data.wear.garment_uses}건`} />
        <Metric label="기간 내 기록된 현재 의류" value={`${data.wardrobe.recorded}벌`} note={`기간 내 기록 없음 ${data.wardrobe.unrecorded}벌`} />
        <Metric label="누적 기록 없는 현재 의류" value={`${data.wardrobe.never_recorded}벌`} note="실제 미착용 여부를 뜻하지 않습니다." />
      </View>
      <Text style={{ color: colors.muted, lineHeight: 22 }}>보유 중 {data.wardrobe.active}벌 · 보관 {data.wardrobe.archived}벌 · 판매 {data.wardrobe.sold}벌 · 기부 {data.wardrobe.donated}벌</Text>
      {data.wear.events === 0 && <View style={{ gap: 10 }}><Text style={{ color: colors.muted, lineHeight: 22 }}>선택한 기간에 착용 기록이 없어요. 기간을 바꾸거나 기록을 남겨 보세요.</Text><Link href="/calendar" style={{ color: colors.primary, paddingVertical: 12 }}>착용 달력에서 기록하기</Link></View>}
      <View style={{ gap: 12, padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}>
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>현재 등록 의류 구매가</Text>
        <Text style={{ color: colors.muted, lineHeight: 22 }}>구매가 입력 {data.wardrobe.priced}벌 · 미입력 {data.wardrobe.unpriced}벌. 구매가는 원화 기준이며, 미입력은 금액 합계에서 제외합니다.</Text>
        {data.costs.length ? <Text style={{ color: colors.text, fontSize: 18 }}>{formatWon(data.costs.reduce((total, cost) => total + cost.amount, 0))} · {data.wardrobe.priced}벌</Text> : <Text style={{ color: colors.muted }}>입력된 구매가가 없어요.</Text>}
      </View>
      <Text style={{ color: colors.muted, lineHeight: 22 }}>아래 분포와 구매가는 현재 등록 정보 기준이며, 기간을 바꿔도 과거 옷장 상태로 복원하지 않습니다.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}><Distribution title="카테고리 분포" groups={data.categories} total={data.wardrobe.total} /><Distribution title="브랜드 상위 10개" groups={data.brands} total={data.wardrobe.total} other={data.other_brand_count} /></View>
    </>}
    <Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '700', fontSize: 21 }}>의류별 기록과 누적 착용당 비용</Text>
    <Text style={{ color: colors.muted, lineHeight: 22 }}>누적 비용 = 현재 구매가 ÷ 기준일까지의 전체 착용 기록 수. 기간 선택은 기록 횟수와 목록 순서를 바꾸며, 누적 비용의 분모는 전체 기록입니다.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{modes.map((mode) => <Choice key={mode.value} label={mode.label} selected={state.filters.mode === mode.value} onPress={() => setState((previous) => ({ ...previous, page: 0, filters: { ...previous.filters, mode: mode.value } }))} />)}</View>
    <SearchField label="통계 의류 검색" placeholder="의류 이름 · 브랜드" value={search} onChange={setSearch} />
    <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>{list.data?.total ?? '—'}벌</Text>
    {list.isPending ? <WardrobeState title="의류별 기록을 불러오는 중" message="잠시만 기다려 주세요." /> : list.isError ? <WardrobeState title="목록을 불러오지 못했어요" message={insightErrorMessage(list.error)} retry={() => { void list.refetch(); }} /> : !list.data.items.length ? <WardrobeState title="조건에 맞는 의류가 없어요" message="검색어나 목록 종류·기간을 바꿔 보세요. 등록된 옷이나 기록이 없으면 목록이 비어 있습니다." /> : list.data.items.map((item) => <View key={item.item_id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}>
      <View style={{ width: 80 }}><PhotoFrame photo={primaryPhoto(photos.data ?? [], item.item_id)} loading={photos.isPending} error={photos.isError} /></View>
      <View style={{ flexGrow: 1, flexBasis: 180, minWidth: 0, gap: 7 }}>
        <Link href={{ pathname: '/wardrobe/[itemId]', params: { itemId: item.item_id } }} style={{ color: colors.primary, paddingVertical: 8, fontWeight: '700' }}>{item.name}</Link>
        <Text style={{ color: colors.muted }}>{item.brand_name || '브랜드 미입력'} · {lifecycleLabels[item.lifecycle_status] ?? item.lifecycle_status}</Text>
        <Text style={{ color: colors.text }}>기간 내 {item.period_wear_count}회 · 누적 {item.lifetime_wear_count}회</Text>
        <Text style={{ color: colors.muted }}>마지막 기록 {item.last_worn_on ?? '없음'} · 누적 착용당 {insightCostLabel(item)}</Text>
      </View>
    </View>)}
    {list.data && list.data.total > insightPageSize && <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
      <ActionButton variant="secondary" label="통계 이전 페이지" disabled={state.page === 0 || list.isFetching} onPress={() => setState({ ...state, page: state.page - 1 })} /><Text style={{ color: colors.muted }}>{state.page + 1} / {last + 1}</Text><ActionButton variant="secondary" label="통계 다음 페이지" disabled={state.page === last || list.isFetching} onPress={() => setState({ ...state, page: state.page + 1 })} />
    </View>}
  </View>;
}

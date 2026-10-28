import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { FormField } from '@/components/ui/FormField';
import { useTheme } from '@/theme/useTheme';
import { WardrobeHeader, WardrobeState } from '../wardrobe/components';
import { usePhotos } from '../wardrobe/photos/hooks';
import { primaryPhoto } from '../wardrobe/photos/model';
import { PhotoFrame } from '../wardrobe/photos/PhotoFrame';
import { calendarDays, localCalendarDate, monthRange, moveMonth } from './calendar';
import { wearDateSchema, wearErrorMessage, wearPageSize } from './model';
import { useWearDayCounts, useWearRange } from './queries';

export function WearCalendarScreen({ initialDate }: { initialDate: string }) {
  const colors = useTheme();
  const [state, setState] = useState({ date: initialDate, page: 0 });
  const [jump, setJump] = useState(initialDate);
  const [dateError, setDateError] = useState<string | undefined>();
  const { date, page } = state;
  const range = monthRange(date);
  const counts = useWearDayCounts(range);
  const query = useWearRange(page, { start: date, end: date });
  const entries = query.data?.items ?? [];
  const ids = [...new Set(entries.flatMap((event) => event.wear_event_items.slice(0, 4).map((entry) => entry.item_id)))];
  const photos = usePhotos(ids);
  const countMap = new Map(counts.data?.map((entry) => [entry.worn_on, entry.event_count]));
  const today = localCalendarDate();
  const previous = moveMonth(date, -1); const next = moveMonth(date, 1);
  const lastPage = query.data ? Math.max(0, Math.ceil(query.data.total / wearPageSize) - 1) : page;
  if (page > lastPage) setState({ ...state, page: lastPage });
  function choose(value: string) { setState({ date: value, page: 0 }); setJump(value); setDateError(undefined); }
  return <View style={{ gap: 24, width: '100%', maxWidth: 960, alignSelf: 'center' }}>
    <WardrobeHeader title="착용 기록" description="날짜를 골라 그날 입은 옷과 코디를 기록해 보세요." />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
      <ActionButton variant="secondary" label="이전 달" disabled={!previous} onPress={() => { if (previous) choose(previous); }} />
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>{Number(date.slice(0, 4))}년 {Number(date.slice(5, 7))}월</Text>
      <ActionButton variant="secondary" label="다음 달" disabled={!next} onPress={() => { if (next) choose(next); }} />
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
      <View style={{ flexGrow: 1, flexBasis: 180, maxWidth: 280 }}><FormField label="날짜로 이동 (YYYY-MM-DD)" value={jump} onChangeText={setJump} maxLength={10} error={dateError} /></View>
      <ActionButton variant="secondary" label="날짜로 이동" onPress={() => { const parsed = wearDateSchema.safeParse(jump); if (parsed.success) choose(parsed.data); else setDateError('올바른 날짜를 입력해 주세요.'); }} />
      <ActionButton variant="secondary" label="오늘" onPress={() => choose(today)} />
    </View>
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 4 }}>
      <View style={{ flexDirection: 'row' }}>{['일', '월', '화', '수', '목', '금', '토'].map((day) => <Text key={day} style={{ width: '14.285714%', color: colors.muted, textAlign: 'center', paddingVertical: 12 }}>{day}</Text>)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{calendarDays(date).map((day, index) => <View key={day ?? `blank-${index}`} style={{ width: '14.285714%', padding: 2 }}>
        {day ? <Pressable accessibilityRole="button" accessibilityState={{ selected: day === date }} accessibilityLabel={`${day}${day === today ? ' 오늘' : ''}, ${counts.isPending || counts.isError ? '기록 수 확인 전' : `착용 기록 ${countMap.get(day) ?? 0}개`}`} onPress={() => choose(day)} style={{ minHeight: 56, borderRadius: 8, borderWidth: 1, borderColor: day === date ? colors.primary : day === today ? colors.muted : 'transparent', backgroundColor: day === date ? colors.surface : colors.background, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Text style={{ color: day === date ? colors.primary : colors.text, fontWeight: day === date || day === today ? '700' : '400' }}>{Number(day.slice(8))}</Text>
          <Text style={{ color: colors.primary, fontSize: 10 }}>{counts.isPending || counts.isError ? '—' : (countMap.get(day) ?? 0) > 0 ? `${Math.min(countMap.get(day)!, 99)}${countMap.get(day)! > 99 ? '+' : ''}개` : ' '}</Text>
        </Pressable> : <View style={{ minHeight: 56 }} />}
      </View>)}</View>
    </View>
    {counts.isError && <WardrobeState title="달력 건수를 불러오지 못했어요" message={wearErrorMessage(counts.error)} retry={() => { void counts.refetch(); }} />}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center' }}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>{date} · {query.data?.total ?? '—'}개</Text>
      <Link href={{ pathname: '/wear/new', params: { date } }} asChild><Pressable accessibilityRole="link" style={{ minHeight: 48, padding: 14, borderRadius: 10, backgroundColor: colors.primary, justifyContent: 'center' }}><Text style={{ color: colors.onPrimary, fontWeight: '700' }}>착용 기록 추가</Text></Pressable></Link>
      <ActionButton variant="secondary" label="기록 새로고침" disabled={query.isFetching || counts.isFetching} onPress={() => { void Promise.all([query.refetch(), counts.refetch(), photos.refetch()]); }} />
    </View>
    {query.isPending ? <WardrobeState title="착용 기록을 불러오는 중" message="잠시만 기다려 주세요." /> : query.isError ? <WardrobeState title="기록을 불러오지 못했어요" message={wearErrorMessage(query.error)} retry={() => { void query.refetch(); }} /> : !entries.length ? <WardrobeState title="이 날짜의 기록이 없어요" message="입었던 코디나 옷을 선택해 첫 기록을 남겨 보세요." /> : entries.map((event, index) => <View key={event.id} style={{ gap: 16, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>착용 기록 {page * wearPageSize + index + 1} · {event.wear_event_items.length}벌</Text>
      <Text style={{ color: colors.muted }}>{event.source_outfit_id ? '코디에서 기록한 구성' : '직접 선택한 구성'}</Text>
      {event.memo && <Text style={{ color: colors.text, lineHeight: 23 }}>{event.memo}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{event.wear_event_items.slice(0, 4).map((entry) => <View key={entry.item_id} style={{ width: 100, gap: 6 }}>
        <PhotoFrame photo={primaryPhoto(photos.data ?? [], entry.item_id)} loading={photos.isPending} error={photos.isError} />
        <Text numberOfLines={2} style={{ color: colors.text, fontSize: 12 }}>{entry.item?.name ?? '확인할 수 없는 옷'}</Text>
        {(entry.item?.deleted_at || entry.item?.lifecycle_status !== 'active') && <Text style={{ color: colors.muted, fontSize: 11 }}>현재 상태 변경됨</Text>}
      </View>)}</View>
      {event.wear_event_items.length > 4 && <Text style={{ color: colors.muted }}>외 {event.wear_event_items.length - 4}벌 · 기록 보기에서 전체 구성 확인</Text>}
      <Link href={{ pathname: '/wear/[eventId]', params: { eventId: event.id } }} style={{ color: colors.primary, paddingVertical: 14 }}>기록 보기 · 수정 · 삭제</Link>
    </View>)}
    {query.data && query.data.total > wearPageSize && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
      <ActionButton variant="secondary" label="기록 이전 페이지" disabled={page === 0 || query.isFetching} onPress={() => setState({ ...state, page: page - 1 })} />
      <Text style={{ color: colors.muted }}>{page + 1} / {lastPage + 1}</Text>
      <ActionButton variant="secondary" label="기록 다음 페이지" disabled={page === lastPage || query.isFetching} onPress={() => setState({ ...state, page: page + 1 })} />
    </View>}
  </View>;
}

import { Fragment, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { useUserId } from '@/providers/AppProviders';
import { useTheme } from '@/theme/useTheme';
import { Icon } from '@/components/ui/Icon';
import { OutfitControl } from '../outfits/EditorControls';
import { OutfitPicker } from '../outfits/Picker';
import { slotLabels } from '../outfits/draft';
import { outfitErrorMessage } from '../outfits/repository';
import { localCalendarDate } from '../wear/calendar';
import { seasonLabels } from '../wardrobe/types';
import { evaluateOutfit, occasionOptions, recommendOutfits, styleOptions, type RecommendationOptions, type RecommendedOutfit, type RecommendationSlot } from './engine';
import { useRecommendationActions } from './hooks';
import { RecommendationCard } from './RecommendationCard';
import { FilterPanel, defaultRecommendationOptions } from './FilterPanel';
import { recommendationFilterKey } from './presentation';

export function RecommendationScreen() { const owner = useUserId()!; return <OwnedRecommendations key={owner} owner={owner} />; }
function OwnedRecommendations({ owner }: { owner: string }) {
  const colors = useTheme(); const viewport = useWindowDimensions(); const desktop = viewport.width >= 1100; const actions = useRecommendationActions(owner);
  const [options, setOptions] = useState(defaultRecommendationOptions); const [applied, setApplied] = useState(defaultRecommendationOptions);
  const [cards, setCards] = useState<{ key: string; outfit: RecommendedOutfit }[]>([]); const [missing, setMissing] = useState<RecommendationSlot[]>([]);
  const [busy, setBusy] = useState(false); const [started, setStarted] = useState(false); const [message, setMessage] = useState(''); const [errorMessage, setErrorMessage] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false); const [resultWidth, setResultWidth] = useState(0);
  const [picker, setPicker] = useState<{ key: string; slot: RecommendationSlot } | null>(null); const lock = useRef(false); const seen = useRef<string[]>([]);
  const changed = recommendationFilterKey(options) !== recommendationFilterKey(applied);
  function configure(change: Partial<RecommendationOptions>) { if (busy) return; setOptions((previous) => ({ ...previous, ...change })); setMessage(''); setErrorMessage(false); }
  function reset() { if (busy) return; setOptions(defaultRecommendationOptions()); setApplied((previous) => ({ ...previous, locks: {} })); seen.current = []; setMessage('추천 조건을 초기화했어요. 추천받기를 눌러 적용해 주세요.'); setErrorMessage(false); }
  async function generate(clearHistory = false) {
    if (lock.current || busy) return;
    lock.current = true; setBusy(true); setMessage(''); setErrorMessage(false); setFiltersOpen(false);
    const fresh = clearHistory || changed; const next = { ...options, seed: randomUUID(), excluded: fresh ? [] : seen.current };
    try {
      const result = await actions.run(async (api, signal) => {
        const [inventory, wornIds] = await Promise.all([api.candidates(next, signal), next.excludeWorn ? api.recentlyWorn(localCalendarDate(), signal) : Promise.resolve([] as string[])]);
        const generated = { ...next, wornIds }; return { options: generated, result: recommendOutfits(inventory, owner, generated) };
      });
      if (result) {
        const value = result.value; setStarted(true); setOptions(value.options); setApplied(value.options); setMissing(value.result.missing); setCards(value.result.outfits.map((outfit) => ({ key: randomUUID(), outfit })));
        seen.current = [...(fresh ? [] : seen.current), ...value.result.outfits.map((outfit) => outfit.signature)].slice(-80);
        if (value.result.exhausted) setMessage('새로운 조합을 모두 확인했어요. 조건을 바꾸거나 이전 조합을 다시 볼 수 있어요.');
        else if (!value.result.outfits.length) setMessage('현재 조건에 맞는 상의와 하의가 각각 1개 이상 필요해요. 계절·최근 착용 제외·고정 조건을 확인해 주세요.');
        else if (value.result.outfits.length < next.count) setMessage(`현재 조건에서 중복 없는 실제 조합 ${value.result.outfits.length}개를 찾았어요.`);
      }
    } catch (error) { if (actions.active()) { setMessage(outfitErrorMessage(error)); setErrorMessage(true); } }
    finally { lock.current = false; if (actions.active()) setBusy(false); }
  }
  function toggleLock(slot: RecommendationSlot, id: string) {
    if (busy) return;
    if (changed) { setMessage('변경한 추천 조건을 먼저 적용한 뒤 아이템을 고정해 주세요.'); return; }
    const locks = { ...applied.locks }; if (locks[slot] === id) delete locks[slot]; else locks[slot] = id;
    setOptions((previous) => ({ ...previous, locks })); setApplied((previous) => ({ ...previous, locks })); seen.current = [];
    setErrorMessage(false); setMessage('고정 조건을 변경했어요. 다른 추천 받기를 누르면 이 아이템을 유지합니다.');
  }
  async function replace(id: string) {
    if (!picker || busy || lock.current) return;
    lock.current = true; setBusy(true); setMessage(''); setErrorMessage(false); const target = picker;
    try {
      const result = await actions.run((api, signal) => api.choose(target.slot, id, signal));
      if (result) {
        if (applied.season && result.value.seasons.length && !result.value.seasons.includes(applied.season)) { setMessage('선택한 계절에 맞는 옷으로 교체해 주세요.'); return; }
        if (applied.excludeWorn && applied.wornIds?.includes(id)) { setMessage('최근 30일에 착용한 옷이에요. 제외 조건을 해제하고 다시 추천받거나 다른 옷을 선택해 주세요.'); return; }
        const card = cards.find((entry) => entry.key === target.key); if (!card) return;
        const outfit = evaluateOutfit({ ...card.outfit.items, [target.slot]: result.value }, applied);
        if (cards.some((entry) => entry.key !== target.key && entry.outfit.signature === outfit.signature)) { setMessage('이미 표시된 코디와 같은 조합이에요. 다른 옷을 선택해 주세요.'); return; }
        setCards((previous) => previous.map((entry) => entry.key === target.key ? { ...entry, outfit } : entry)); setPicker(null);
      }
    } catch (error) { if (actions.active()) { setMessage(outfitErrorMessage(error)); setErrorMessage(true); } }
    finally { lock.current = false; if (actions.active()) setBusy(false); }
  }
  const columns = resultWidth >= 780 ? 3 : resultWidth >= 520 ? 2 : 1; const cardWidth = Math.max(0, Math.floor((resultWidth - (columns - 1) * 16) / columns));
  const form = <FilterPanel options={options} busy={busy} onChange={configure} onReset={reset} onApply={() => { void generate(); }} />;
  const occasion = occasionOptions.find((value) => value.value === options.occasion)?.label ?? '일상'; const style = styleOptions.find((value) => value.value === options.style)?.label ?? '전체';
  return <View style={{ gap: desktop ? 28 : 18 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><View style={{ gap: 6 }}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>OUTFIT RECOMMENDATION</Text><Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '800', fontSize: 29 }}>코디 추천</Text><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>내 옷으로 만드는 다양한 스타일을 제안해드려요.</Text></View>{desktop && started && <OutfitControl label={started ? '다른 추천 받기' : '코디 추천받기'} icon="refresh" disabled={busy} onPress={() => { void generate(); }} />}</View>
    {!desktop && <View style={{ flexDirection: 'row', gap: 8 }}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}><OutfitControl label={occasion} icon="user" selected onPress={() => setFiltersOpen(true)} disabled={busy} /><OutfitControl label={style === '전체' ? '전체 스타일' : style} icon="heart" onPress={() => setFiltersOpen(true)} disabled={busy} /><OutfitControl label={seasonLabels[options.season as keyof typeof seasonLabels] ?? '모든 계절'} icon="sun" onPress={() => setFiltersOpen(true)} disabled={busy} /></ScrollView><OutfitControl label="필터" icon="settings" expanded={filtersOpen} onPress={() => setFiltersOpen(true)} disabled={busy} /></View>}
    <View testID="recommendation-workspace" style={{ flexDirection: desktop ? 'row' : 'column', alignItems: 'flex-start', gap: 24 }}>
      {desktop && <View testID="recommendation-sidebar" style={{ width: 248, flexShrink: 0 }}>{form}</View>}
      <View onLayout={(event) => setResultWidth(event.nativeEvent.layout.width)} style={{ flex: desktop ? 1 : undefined, width: desktop ? undefined : '100%', minWidth: 0, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><View style={{ gap: 5 }}><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>추천 코디 <Text style={{ color: colors.primary }}>{cards.length}</Text></Text>{(desktop || changed && cards.length > 0) && <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{changed && cards.length ? '조건이 변경됐어요. 추천받기를 눌러 적용하세요.' : '내 옷장을 기반으로 한 맞춤 코디예요.'}</Text>}</View>{!desktop && <OutfitControl label="다른 추천 받기" icon="refresh" iconOnly disabled={busy} onPress={() => { void generate(); }} />}</View>
        {Object.keys(applied.locks).length > 0 && <View style={{ gap: 6 }}><Text style={{ color: colors.primary, fontSize: 12 }}>{Object.keys(applied.locks).map((slot) => slotLabels[slot as RecommendationSlot]).join(' · ')} 고정 중</Text><OutfitControl label="아이템 고정 해제" variant="quiet" disabled={busy} onPress={() => { setOptions((previous) => ({ ...previous, locks: {} })); setApplied((previous) => ({ ...previous, locks: {} })); seen.current = []; }} /></View>}
        {message !== '' && <Text accessibilityLiveRegion="polite" style={{ color: errorMessage ? colors.danger : colors.primary, fontSize: 12, lineHeight: 20 }}>{message}</Text>}
        {cards.length === 0 && <View style={{ minHeight: desktop ? 450 : 260, width: '100%', borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14, backgroundColor: colors.surface }}><Icon name="hanger" color={colors.primary} size={38} /><Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{busy ? '내 옷장에서 조합을 찾고 있어요' : started ? '추천 조건을 조금 바꿔보세요' : '오늘 입고 싶은 스타일을 골라보세요'}</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 21, textAlign: 'center' }}>실제로 보유 중인 옷만 조합합니다. 마음에 드는 옷은 고정하고, 하나씩 바꿔볼 수 있어요.</Text>{!desktop && <OutfitControl label="추천 조건 선택" variant="primary" disabled={busy} onPress={() => setFiltersOpen(true)} />}</View>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>{resultWidth > 0 && cards.map((card, index) => <Fragment key={card.key}>{!desktop && columns === 1 && index === 1 && <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 16, fontWeight: '700', width: '100%', marginTop: 4 }}>다른 추천 코디 <Text style={{ color: colors.primary }}>{cards.length - 1}</Text></Text>}<View style={{ width: cardWidth, minWidth: 0 }}><RecommendationCard owner={owner} outfit={card.outfit} index={index} options={applied} disabled={busy} onBusy={setBusy} onLock={toggleLock} onReplace={(slot) => setPicker({ key: card.key, slot })} /></View></Fragment>)}</View>
        {cards.length > 0 && missing.length > 0 && <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}>{missing.map((slot) => slotLabels[slot]).join(' · ')}: 조건에 맞는 보유 의류가 없어 제외했어요.</Text>}
        {started && <View style={{ gap: 8 }}><OutfitControl label="이전 조합 다시 보기" variant="quiet" disabled={busy} onPress={() => { void generate(true); }} /><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}>규칙 기반 추천 점수: 색상 48% · 계절 18% · 스타일·상황 14% · 소재 12% · 다양성 8%. 실제 가능한 조합 수에 따라 추천 개수가 달라질 수 있어요.</Text></View>}
      </View>
    </View>
    {!desktop && <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => { if (!busy) setFiltersOpen(false); }}><View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}><Pressable accessibilityRole="button" accessibilityLabel="추천 필터 닫기" disabled={busy} onPress={() => setFiltersOpen(false)} style={{ flex: 1 }} /><SafeAreaView accessibilityViewIsModal edges={['bottom']} style={{ maxHeight: '90%', backgroundColor: colors.background, borderTopLeftRadius: 18, borderTopRightRadius: 18 }}><View style={{ paddingHorizontal: 18, paddingTop: 12, alignItems: 'flex-end' }}><OutfitControl label="필터 닫기" icon="close" iconOnly disabled={busy} onPress={() => setFiltersOpen(false)} /></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16 }}>{form}</ScrollView></SafeAreaView></View></Modal>}
    {picker && <Modal visible animationType="slide" onRequestClose={() => { if (!busy) setPicker(null); }}><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 18, width: '100%', maxWidth: 900, alignSelf: 'center' }}><OutfitControl label="옷 교체 닫기" disabled={busy} onPress={() => setPicker(null)} /><OutfitPicker key={picker.slot} slot={picker.slot} selectedId={cards.find((card) => card.key === picker.key)?.outfit.items[picker.slot]?.id} busy={busy} onSelect={(id) => { void replace(id); }} />{message !== '' && <Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 22 }}>{message}</Text>}</ScrollView></SafeAreaView></Modal>}
  </View>;
}

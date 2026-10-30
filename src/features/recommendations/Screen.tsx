import { useRef, useState } from 'react';
import { Modal, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { SelectField } from '@/components/ui/SelectField';
import { useUserId } from '@/providers/AppProviders';
import { useTheme } from '@/theme/useTheme';
import { WardrobeHeader, WardrobeState } from '../wardrobe/components';
import { seasons, seasonLabels } from '../wardrobe/types';
import { OutfitControl } from '../outfits/EditorControls';
import { OutfitPicker } from '../outfits/Picker';
import { slotLabels } from '../outfits/draft';
import { outfitErrorMessage } from '../outfits/repository';
import { evaluateOutfit, recommendOutfits, styleOptions, type RecommendationOptions, type RecommendedOutfit, type RecommendationSlot } from './engine';
import { useRecommendationActions } from './hooks';
import { RecommendationCard } from './RecommendationCard';

export function RecommendationScreen() { const owner = useUserId()!; return <OwnedRecommendations key={owner} owner={owner} />; }
function OwnedRecommendations({ owner }: { owner: string }) {
  const colors = useTheme(); const { width } = useWindowDimensions(); const actions = useRecommendationActions(owner);
  const [options, setOptions] = useState<RecommendationOptions>({ season: '', style: '', count: 4, includeOuterwear: true, locks: {}, seed: 'initial' });
  const [cards, setCards] = useState<{ key: string; outfit: RecommendedOutfit }[]>([]); const [missing, setMissing] = useState<RecommendationSlot[]>([]);
  const [busy, setBusy] = useState(false); const [started, setStarted] = useState(false); const [message, setMessage] = useState('');
  const [picker, setPicker] = useState<{ key: string; slot: RecommendationSlot } | null>(null); const lock = useRef(false); const seen = useRef<string[]>([]);
  function configure(change: Partial<RecommendationOptions>) { if (busy) return; setOptions((previous) => ({ ...previous, ...change })); setCards([]); setStarted(false); setMessage(''); seen.current = []; }
  async function generate(clearHistory = false, nextOptions = options) {
    if (lock.current || busy) return;
    lock.current = true; setBusy(true); setMessage(''); setStarted(true);
    const next = { ...nextOptions, seed: randomUUID(), excluded: clearHistory ? [] : seen.current };
    try {
      const result = await actions.run(async (api, signal) => recommendOutfits(await api.candidates(next, signal), owner, next));
      if (result) {
        setOptions(next); setMissing(result.value.missing); setCards(result.value.outfits.map((outfit) => ({ key: randomUUID(), outfit })));
        seen.current = [...(clearHistory ? [] : seen.current), ...result.value.outfits.map((outfit) => outfit.signature)].slice(-80);
        if (result.value.exhausted) setMessage('지금 조건에서 새로운 조합을 모두 확인했어요. 고정을 풀거나 이전 조합을 다시 볼 수 있어요.');
        else if (!result.value.outfits.length) setMessage('보유 중인 상의와 하의가 각각 1개 이상 필요해요. 계절 조건과 고정한 옷도 확인해 주세요.');
        else if (result.value.outfits.length < next.count) setMessage(`중복 없는 실제 조합 ${result.value.outfits.length}개를 찾았어요. 보유 의류와 조건에 따라 추천 수가 달라집니다.`);
      }
    } catch (error) { if (actions.active()) { setCards([]); setMessage(outfitErrorMessage(error)); } }
    finally { lock.current = false; if (actions.active()) setBusy(false); }
  }
  function toggleLock(slot: RecommendationSlot, id: string) {
    if (busy) return;
    const locks = { ...options.locks }; if (locks[slot] === id) delete locks[slot]; else locks[slot] = id;
    setOptions((previous) => ({ ...previous, locks })); seen.current = [];
    setMessage('고정 조건을 변경했어요. 다른 코디 추천을 누르면 이 아이템을 유지합니다.');
  }
  async function replace(id: string) {
    if (!picker || busy || lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    const target = picker;
    try {
      const result = await actions.run((api, signal) => api.choose(target.slot, id, signal));
      if (result) {
        if (options.season && result.value.seasons.length && !result.value.seasons.includes(options.season)) { setMessage('선택한 계절에 맞는 옷으로 교체해 주세요.'); return; }
        const card = cards.find((entry) => entry.key === target.key); if (!card) return;
        const outfit = evaluateOutfit({ ...card.outfit.items, [target.slot]: result.value }, options);
        if (cards.some((entry) => entry.key !== target.key && entry.outfit.signature === outfit.signature)) { setMessage('이미 표시된 코디와 같은 조합이에요. 다른 옷을 선택해 주세요.'); return; }
        setCards((previous) => previous.map((entry) => entry.key === target.key ? { ...entry, outfit } : entry)); setPicker(null);
      }
    } catch (error) { if (actions.active()) setMessage(outfitErrorMessage(error)); }
    finally { lock.current = false; if (actions.active()) setBusy(false); }
  }
  const columns = width >= 1200 ? 3 : width >= 760 ? 2 : 1;
  return <View style={{ gap: 24 }}><WardrobeHeader title="코디 추천" description="내 옷장의 실제 의류로, 오늘 입고 싶은 새로운 조합을 찾아보세요." />
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 18, gap: 16 }}>
      <Text style={{ color: colors.primary, fontSize: 11, letterSpacing: 1.2, fontWeight: '700' }}>01 / FIND YOUR NEXT LOOK</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><View style={{ flexGrow: 1, flexBasis: 160 }}><SelectField label="추천 계절" value={options.season} disabled={busy} options={[{ value: '', label: '모든 계절' }, ...seasons.map((value) => ({ value, label: seasonLabels[value] }))]} onChange={(season) => configure({ season, locks: {} })} /></View><View style={{ flexGrow: 1, flexBasis: 160 }}><SelectField label="추천 스타일" value={options.style} disabled={busy} options={styleOptions} onChange={(style) => configure({ style })} /></View><View style={{ flexGrow: 1, flexBasis: 100 }}><SelectField label="추천 개수" value={String(options.count)} disabled={busy} options={[3, 4, 5].map((value) => ({ value: String(value), label: `${value}개` }))} onChange={(count) => configure({ count: Number(count) })} /></View></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><OutfitControl label={options.includeOuterwear ? '아우터 포함' : '아우터 제외'} selected={options.includeOuterwear} disabled={busy} onPress={() => { const locks = { ...options.locks }; delete locks.outerwear; configure({ includeOuterwear: !options.includeOuterwear, locks }); }} />{Object.keys(options.locks).length > 0 && <OutfitControl label={`아이템 고정 해제 (${Object.keys(options.locks).length})`} disabled={busy} onPress={() => { setOptions((previous) => ({ ...previous, locks: {} })); seen.current = []; }} />}</View>
      {Object.entries(options.locks).length > 0 && <Text style={{ color: colors.primary, fontSize: 12 }}>{Object.keys(options.locks).map((slot) => slotLabels[slot as RecommendationSlot]).join(' · ')} 고정 중</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><OutfitControl label={started ? '다른 코디 추천' : '내 옷으로 추천받기'} variant="primary" loading={busy} onPress={() => { void generate(); }} />{started && <OutfitControl label="이전 조합 다시 보기" disabled={busy} onPress={() => { void generate(true); }} />}</View>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>색상 조화 48% · 계절 18% · 스타일 14% · 소재 12% · 다양성 8%. 규칙 기반 점수이며 취향에 따라 다르게 느낄 수 있어요.</Text>
    </View>
    {message !== '' && <Text accessibilityLiveRegion="polite" style={{ color: colors.primary, fontSize: 13, lineHeight: 22 }}>{message}</Text>}
    {cards.length > 0 && missing.length > 0 && <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>{missing.map((slot) => slotLabels[slot]).join(' · ')}: 현재 조건에서 보유 의류가 없어 제외했어요.</Text>}
    {!started && <WardrobeState title="옷장을 바탕으로 조합해 드려요" message="추천받기를 누른 후 마음에 드는 옷을 고정하거나 하나씩 교체할 수 있어요. 저장하면 실제 의류 ID와 표현 이미지가 함께 보관됩니다." />}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>{cards.map((card, index) => <View key={card.key} style={{ width: columns === 3 ? '32%' : columns === 2 ? '48.7%' : '100%', minWidth: 0 }}><RecommendationCard owner={owner} outfit={card.outfit} index={index} options={options} disabled={busy} onBusy={setBusy} onLock={toggleLock} onReplace={(slot) => setPicker({ key: card.key, slot })} /></View>)}</View>
    {picker && <Modal visible animationType="slide" onRequestClose={() => { if (!busy) setPicker(null); }}><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 18, width: '100%', maxWidth: 900, alignSelf: 'center' }}><OutfitControl label="옷 교체 닫기" disabled={busy} onPress={() => setPicker(null)} /><OutfitPicker key={picker.slot} slot={picker.slot} selectedId={cards.find((card) => card.key === picker.key)?.outfit.items[picker.slot]?.id} busy={busy} onSelect={(id) => { void replace(id); }} />{message !== '' && <Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 22 }}>{message}</Text>}</ScrollView></SafeAreaView></Modal>}
  </View>;
}

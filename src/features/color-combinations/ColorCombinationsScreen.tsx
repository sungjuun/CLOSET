import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, Text, useWindowDimensions, View } from 'react-native';
import type Svg from 'react-native-svg';
import { useUserId } from '@/providers/AppProviders';
import { useTheme } from '@/theme/useTheme';
import { ColorPanel } from './ColorPanel';
import { OutfitArtwork } from './OutfitArtwork';
import { FinderControl as Control, PairSummary } from './FinderControls';
import { FinderResult } from './FinderResult';
import { compareAdd, featuredPairs, pairKey, randomPair, samePair, selectionFromParams, type ColorId, type ColorPair, type FinderSelection } from './finder';
import { useColorFavorites } from './useFavorites';
import { pairLink, savePairImage, sharePair } from './sharing';

export function ColorCombinationsScreen() {
  const owner = useUserId();
  return owner ? <ScopedFinder key={owner} owner={owner} /> : null;
}
function ScopedFinder({ owner }: { owner: string }) {
  const colors = useTheme(); const { width } = useWindowDimensions(); const router = useRouter();
  const params = useLocalSearchParams<{ top?: string | string[]; bottom?: string | string[] }>();
  const selection = selectionFromParams(params); const compact = width < 700; const desktop = width >= 960;
  const pair: ColorPair | null = selection.top && selection.bottom ? { top: selection.top, bottom: selection.bottom } : null;
  const favorites = useColorFavorites(owner);
  const [showFavorites, setShowFavorites] = useState(false); const [favoriteCount, setFavoriteCount] = useState(6);
  const [comparison, setComparison] = useState<ColorPair[]>([]);
  const [message, setMessage] = useState<string | null>(null); const [actionError, setActionError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null); const [exporting, setExporting] = useState(false);
  const exportLock = useRef(false); const exportRef = useRef<Svg | null>(null);
  const saved = Boolean(pair && favorites.query.data?.some((entry) => samePair(entry, pair)));
  function choose(next: FinderSelection) {
    if (exportLock.current) return;
    setMessage(null); setActionError(null); setLink(null);
    router.setParams({ top: next.top ?? '', bottom: next.bottom ?? '' });
  }
  function select(slot: 'top' | 'bottom', id: ColorId) { choose({ ...selection, [slot]: selection[slot] === id ? null : id }); }
  function addComparison() {
    if (!pair) return;
    try { setComparison(compareAdd(comparison, pair)); setMessage(comparison.some((entry) => samePair(entry, pair)) ? '이미 비교에 담긴 조합이에요.' : '아래 비교함에 담았어요.'); setActionError(null); }
    catch { setActionError('한 번에 3가지 조합을 비교할 수 있어요. 비교함에서 하나를 제거해 주세요.'); }
  }
  async function share() {
    if (!pair) return;
    setLink(pairLink(pair)); setActionError(null);
    try { setMessage(await sharePair(pair)); }
    catch { setMessage('아래 링크를 선택해 복사한 뒤 공유해 주세요.'); }
  }
  async function exportImage() {
    if (!pair || exportLock.current) return;
    exportLock.current = true; setExporting(true); setActionError(null); setMessage(null);
    try { setMessage(await savePairImage(pair, exportRef.current)); }
    catch { setActionError('이미지를 저장하지 못했어요. 브라우저나 앱의 저장·공유 지원을 확인하고 다시 시도해 주세요.'); }
    finally { exportLock.current = false; setExporting(false); }
  }

  return <View style={{ width: '100%', maxWidth: 1320, alignSelf: 'center', gap: 28 }}>
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 26, gap: 24 }}>
      <View style={{ flexDirection: compact ? 'column' : 'row', justifyContent: 'space-between', gap: 14 }}>
        <View style={{ gap: 12 }}><Text style={{ color: colors.primary, fontSize: 10, letterSpacing: 1.6 }}>01 / THE COLOR FINDER</Text><Text accessibilityRole="header" aria-level={1} style={{ color: colors.text, fontSize: 29, fontWeight: '800', lineHeight: 38 }}>옷 색깔 조합하기</Text></View>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 23, textAlign: compact ? 'left' : 'right' }}>상의든 하의든 먼저 골라보세요.{ '\n' }함께 입을 수 있는 색이 남습니다.</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}><Control label="랜덤 조합 뽑기" icon="refresh" primary disabled={exporting} onPress={() => choose(randomPair(selection))} /><Control label={`찜한 조합${favorites.query.data ? ` ${favorites.query.data.length}` : ''}`} icon="heart" selected={showFavorites} onPress={() => setShowFavorites(!showFavorites)} /></View>
        <Control label="초기화" disabled={exporting || (!selection.top && !selection.bottom)} onPress={() => choose({ top: null, bottom: null })} />
      </View>
    </View>

    {(favorites.query.isError || favorites.error) && <View style={{ padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 8, gap: 12 }}><Text accessibilityRole="alert" style={{ color: colors.danger, lineHeight: 21, fontSize: 13 }}>{favorites.error ?? '찜한 조합을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.'}</Text><Control label="찜 목록 다시 불러오기" onPress={favorites.reload} disabled={favorites.busy} /></View>}

    <View style={{ flexDirection: compact ? 'column' : 'row', alignItems: 'stretch', gap: compact ? 16 : 24 }}>
      <ColorPanel slot="top" selected={selection.top} other={selection.bottom} onSelect={(id) => select('top', id)} compact={compact} />
      <ColorPanel slot="bottom" selected={selection.bottom} other={selection.top} onSelect={(id) => select('bottom', id)} compact={compact} />
    </View>

    {pair ? <FinderResult pair={pair} desktop={desktop} compact={compact} saved={saved} favoriteBusy={favorites.busy} favoriteDisabled={favorites.busy || !favorites.query.isSuccess} exporting={exporting} compared={comparison.some((entry) => samePair(entry, pair))}
      onFavorite={() => { void favorites.setFavorite(pair, !saved); }} onShare={() => { void share(); }} onCompare={addComparison} onExport={() => { void exportImage(); }} onChoose={choose} />
      : <View style={{ padding: 24, gap: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}><Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{selection.top ? '하의 색상을 고르면 조합이 완성돼요.' : selection.bottom ? '상의 색상을 고르면 조합이 완성돼요.' : '한 가지 색부터 시작해 보세요.'}</Text><Text style={{ color: colors.muted, lineHeight: 23, fontSize: 13 }}>두 색을 고르면 옷 모양 미리보기와 배색 설명을 볼 수 있어요. 랜덤 조합으로 시작해도 좋습니다.</Text></View>}

    {message && <Text accessibilityLiveRegion="polite" style={{ color: colors.primary, fontSize: 13, lineHeight: 22 }}>{message}</Text>}
    {actionError && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13, lineHeight: 22 }}>{actionError}</Text>}
    {link && <View style={{ padding: 16, gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}><Text style={{ color: colors.muted, fontSize: 12 }}>로그인 후 같은 조합을 볼 수 있는 링크</Text><Text selectable style={{ color: colors.primary, fontSize: 13, lineHeight: 22 }}>{link}</Text></View>}

    {comparison.length > 0 && <View style={{ gap: 16 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><Text accessibilityRole="header" aria-level={2} style={{ color: colors.text, fontWeight: '700', fontSize: 20 }}>조합 비교 · {comparison.length}/3</Text><Control label="비교 비우기" onPress={() => setComparison([])} /></View><View style={{ flexDirection: compact ? 'column' : 'row', gap: 12 }}>{comparison.map((entry) => <PairSummary key={pairKey(entry)} pair={entry} onApply={() => choose(entry)} onRemove={() => setComparison(comparison.filter((value) => !samePair(value, entry)))} />)}</View></View>}

    {showFavorites && <View style={{ gap: 16 }}><Text accessibilityRole="header" aria-level={2} style={{ color: colors.text, fontWeight: '700', fontSize: 20 }}>찜한 조합</Text><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>내 계정에 저장됩니다. 상의·하의 순서까지 함께 보관해요.</Text>
      {favorites.query.isPending ? <Text style={{ color: colors.muted }}>찜 목록을 불러오는 중…</Text> : favorites.query.data?.length === 0 ? <Text style={{ color: colors.muted }}>아직 찜한 조합이 없어요. 마음에 드는 결과에서 찜하기를 눌러보세요.</Text> : <View style={{ gap: 12 }}>{favorites.query.data?.slice(0, favoriteCount).map((entry) => <PairSummary key={pairKey(entry)} pair={entry} onApply={() => choose(entry)} />)}</View>}
      {(favorites.query.data?.length ?? 0) > favoriteCount && <Control label="찜한 조합 더 보기" onPress={() => setFavoriteCount(favoriteCount + 6)} />}
    </View>}

    {!selection.top && !selection.bottom && <View style={{ gap: 16 }}><Text style={{ color: colors.text, fontWeight: '700', fontSize: 17 }}>이런 조합으로 시작해 보세요</Text><View style={{ flexDirection: compact ? 'column' : 'row', gap: 12 }}>{featuredPairs.slice(0, 3).map((entry) => <PairSummary key={pairKey(entry)} pair={entry} onApply={() => choose(entry)} />)}</View></View>}
    {Platform.OS !== 'web' && pair && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: -10_000, width: 320 }}><OutfitArtwork pair={pair} exportCard svgRef={exportRef} /></View>}
  </View>;
}

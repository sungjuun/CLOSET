import { Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { describePair, matchingColors, type ColorPair } from './finder';
import { OutfitArtwork } from './OutfitArtwork';
import { artworkBackground } from './art';
import { FinderBadge as Badge, FinderControl as Control } from './FinderControls';

type Props = { pair: ColorPair; desktop: boolean; compact: boolean; saved: boolean; favoriteDisabled: boolean; favoriteBusy: boolean; exporting: boolean; compared: boolean; onFavorite: () => void; onShare: () => void; onCompare: () => void; onExport: () => void; onChoose: (pair: ColorPair) => void };
export function FinderResult(props: Props) {
  const colors = useTheme(); const { pair, desktop, compact, exporting } = props; const detail = describePair(pair);
  const alternatives = matchingColors(pair.top, 'bottom').filter((color) => color.id !== pair.bottom).slice(0, 6);
  return <View style={{ flexDirection: desktop ? 'row' : 'column', borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.background }}>
    <View style={{ width: desktop ? '36%' : '100%', maxWidth: desktop ? undefined : 440, alignSelf: desktop ? 'stretch' : 'center', justifyContent: 'center', backgroundColor: artworkBackground(detail.top.hex) }}><OutfitArtwork pair={pair} /></View>
    <View style={{ flex: 1, minWidth: 0, padding: compact ? 18 : 28, gap: 20 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Control label={props.favoriteBusy ? '찜 저장 중…' : props.saved ? '찜 해제' : '찜하기'} icon="heart" selected={props.saved} disabled={props.favoriteDisabled || exporting} onPress={props.onFavorite} />
        <Control label="링크 공유" icon="arrow" disabled={exporting} onPress={props.onShare} />
        <Control label={props.compared ? '비교에 담김' : '비교에 담기'} icon="layers" disabled={exporting} onPress={props.onCompare} />
        <Control label={exporting ? '이미지 준비 중…' : '이미지 저장'} icon="down" disabled={exporting} onPress={props.onExport} />
      </View>
      <View style={{ gap: 9 }}><Text accessibilityRole="header" aria-level={2} style={{ color: colors.text, fontSize: 25, lineHeight: 34, fontWeight: '800' }}>{detail.title}</Text><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21, fontWeight: '600' }}>{detail.top.label} 상의 × {detail.bottom.label} 하의</Text></View>
      <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 25 }}>{detail.text}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{detail.tags.map((tag) => <Badge key={tag}>#{tag}</Badge>)}</View>
      <View style={{ padding: 18, gap: 13, backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: colors.primary, borderRadius: 6 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>배색 포인트</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}><Badge>상의 · {detail.topTone.brightness}</Badge><Badge>상의 · {detail.topTone.chroma}</Badge><Badge>{detail.contrast}</Badge></View>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 22 }}>색상표의 밝기와 선명도로 살펴본 조합입니다. 실제 옷의 소재와 조명에 따라 다르게 보일 수 있어요.</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}><Badge>{detail.top.label} {detail.top.hex}</Badge><Badge>{detail.bottom.label} {detail.bottom.hex}</Badge></View>
      <View style={{ padding: 16, gap: 12, borderRadius: 7, backgroundColor: colors.surface }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>이 상의에 어울리는 다른 하의</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{alternatives.map((color) => <Control key={color.id} label={color.label} disabled={exporting} onPress={() => props.onChoose({ top: pair.top, bottom: color.id })} />)}</View></View>
    </View>
  </View>;
}

import { useMemo, type RefObject } from 'react';
import { View } from 'react-native';
import Svg, { SvgXml } from 'react-native-svg';
import { outfitArtwork } from './art';
import { colorOf, type ColorPair } from './finder';

export function OutfitArtwork({ pair, exportCard = false, svgRef }: { pair: ColorPair; exportCard?: boolean; svgRef?: RefObject<Svg | null> }) {
  const xml = useMemo(() => outfitArtwork(pair, exportCard), [pair, exportCard]);
  return <View accessibilityLabel={`${colorOf(pair.top).label} 상의와 ${colorOf(pair.bottom).label} 하의 미리보기`} style={{ width: '100%', aspectRatio: 480 / (exportCard ? 800 : 640), overflow: 'hidden' }}>
    <SvgXml xml={xml} override={{ width: '100%', height: '100%', ...(svgRef ? { ref: svgRef } : {}), 'aria-hidden': true }} />
  </View>;
}

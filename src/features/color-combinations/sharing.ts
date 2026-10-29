import { Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type Svg from 'react-native-svg';
import { pairKey, pairQuery, type ColorPair } from './finder';

export function pairLink(pair: ColorPair) {
  return `https://closet.itsmesungjun.chatgpt.site/color-combinations?${pairQuery(pair)}`;
}
export async function sharePair(pair: ColorPair) {
  await Share.share({ message: `CLOSET 색상 조합\n${pairLink(pair)}`, url: pairLink(pair) });
  return '공유 창에서 조합 링크를 전달할 수 있어요.';
}
export async function savePairImage(pair: ColorPair, svg: Svg | null) {
  if (!svg || !await Sharing.isAvailableAsync()) throw new Error('sharing_unavailable');
  const base64 = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('image_timeout')), 15_000);
    svg.toDataURL((data) => { clearTimeout(timeout); resolve(data); }, { width: 960, height: 1600 });
  });
  const file = new File(Paths.cache, `closet-${pairKey(pair).replace(':', '-')}.png`);
  try {
    file.write(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)));
    await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: '색상 조합 이미지 저장·공유' });
    return '공유 창에서 이미지를 저장하거나 공유할 수 있어요.';
  } finally { if (file.exists) file.delete(); }
}

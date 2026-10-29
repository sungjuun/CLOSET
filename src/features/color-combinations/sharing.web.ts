import type Svg from 'react-native-svg';
import { outfitArtwork } from './art';
import { pairKey, pairQuery, type ColorPair } from './finder';

export function pairLink(pair: ColorPair) {
  return `${window.location.origin}/color-combinations?${pairQuery(pair)}`;
}
export async function sharePair(pair: ColorPair) {
  if (!navigator.clipboard?.writeText) throw new Error('copy_unavailable');
  await navigator.clipboard.writeText(pairLink(pair));
  return '조합 링크를 복사했어요.';
}
export async function savePairImage(pair: ColorPair, _svg: Svg | null) {
  const url = URL.createObjectURL(new Blob([outfitArtwork(pair, true)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('image_timeout')), 15_000);
      image.onload = () => { clearTimeout(timeout); resolve(); };
      image.onerror = () => { clearTimeout(timeout); reject(new Error('image_failed')); };
      image.src = url;
    });
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 1600;
    const context = canvas.getContext('2d'); if (!context) throw new Error('image_failed');
    context.drawImage(image, 0, 0, 960, 1600);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('image_failed')), 'image/png'));
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = downloadUrl; anchor.download = `closet-${pairKey(pair).replace(':', '-')}.png`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    return '조합 이미지를 저장했어요.';
  } finally { URL.revokeObjectURL(url); }
}

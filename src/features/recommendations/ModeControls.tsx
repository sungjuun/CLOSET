import { Text, View } from 'react-native';
import { OutfitControl } from '../outfits/EditorControls';
import { useTheme } from '@/theme/useTheme';
import { bodyPresets, presetLabels, type BodyPreset, type ViewMode } from './renderModel';

export function ModeControls({ mode, preset, disabled, onMode, onPreset }: { mode: ViewMode; preset: BodyPreset; disabled: boolean; onMode: (value: ViewMode) => void; onPreset: (value: BodyPreset) => void }) {
  const colors = useTheme();
  return <View style={{ gap: 10 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    <OutfitControl label="아이템 나열형" selected={mode === 'items'} disabled={disabled} onPress={() => onMode('items')} />
    <OutfitControl label="마네킹형 · 샘플" selected={mode === 'mannequin'} disabled={disabled} onPress={() => onMode('mannequin')} />
  </View>{mode === 'mannequin' && <><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{bodyPresets.map((value) => <OutfitControl key={value} label={presetLabels[value]} selected={preset === value} disabled={disabled} onPress={() => onPreset(value)} />)}</View><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>체형과 색상을 보는 샘플입니다. 실제 보유 제품을 착용한 이미지가 아니며 외부 AI를 사용하지 않습니다.</Text></>}</View>;
}

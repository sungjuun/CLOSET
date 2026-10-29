import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/theme/useTheme';
import { useCategories } from '../wardrobe/queries';
import { primaryPhoto, type PrivatePhoto } from '../wardrobe/photos/model';
import { PhotoFrame } from '../wardrobe/photos/PhotoFrame';
import { seasonLabels } from '../wardrobe/types';
import { outfitNameSchema, selectionProblem, slotDisplayLabel, slots, type OutfitSlot } from './draft';
import type { SavedOutfit } from './catalog';

export type RenameResult = { status: 'saved' | 'cancelled' } | { status: 'error'; message: string };
type Props = {
  outfit: SavedOutfit; number: number; photos: PrivatePhoto[];
  photoPending: boolean; photoError: boolean; busy: boolean; saving: boolean;
  onDelete: (outfit: SavedOutfit) => void;
  onRename: (id: string, expected: string, name: string) => Promise<RenameResult>;
};

export function OutfitCatalogCard({ outfit, number, photos, photoPending, photoError, busy, saving, onDelete, onRename }: Props) {
  const colors = useTheme();
  const categories = useCategories();
  const [draft, setDraft] = useState<{ name: string; expected: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const dirty = draft !== null && (draft.name !== outfit.name || draft.expected !== outfit.updated_at);
  const unavailable = outfit.outfit_items.some((entry) => !entry.item || entry.item.deleted_at || entry.item.lifecycle_status !== 'active' || (categories.data && selectionProblem(entry.item, entry.slot as OutfitSlot, outfit.user_id, categories.data)));
  async function saveName() {
    if (!draft || !dirty || busy) return;
    const parsed = outfitNameSchema.safeParse(draft.name);
    if (!parsed.success) { setError(parsed.error.issues[0]!.message); return; }
    setError(null); setSaved(false);
    const result = await onRename(outfit.id, draft.expected, parsed.data);
    if (!alive.current) return;
    if (result.status === 'saved') { setDraft(null); setSaved(true); }
    else if (result.status === 'error') setError(result.message);
  }
  const detail = { pathname: '/outfits/[outfitId]' as const, params: { outfitId: outfit.id } };
  return <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.background }}>
    <View style={{ padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text accessibilityLiveRegion="polite" style={{ color: saved ? colors.primary : colors.muted, fontSize: 12 }}>{saved ? '코디 이름 · 저장됨' : '코디 이름'}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>{String(number).padStart(2, '0')}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput accessibilityLabel={`${outfit.name} 코디 이름`} aria-invalid={Boolean(error)} value={draft?.name ?? outfit.name} maxLength={160} editable={!busy} autoCorrect={false} returnKeyType="done"
          onChangeText={(name) => { setDraft((previous) => ({ name, expected: previous?.expected ?? outfit.updated_at })); setError(null); setSaved(false); }}
          onSubmitEditing={() => { void saveName(); }}
          style={{ flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 9, paddingHorizontal: 11, borderWidth: 1, borderColor: error ? colors.danger : colors.border, borderRadius: 6, color: colors.text, backgroundColor: colors.background, fontSize: 14 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={`${outfit.name} 코디 이름 저장`} accessibilityState={{ disabled: busy || !dirty, busy: saving }} disabled={busy || !dirty} onPress={() => { void saveName(); }}
          style={({ pressed }) => ({ minWidth: 56, minHeight: 44, borderWidth: 1, borderColor: colors.muted, borderRadius: 7, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: pressed ? colors.surface : colors.background, opacity: busy || !dirty ? 0.45 : 1 })}>
          {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={{ color: dirty ? colors.primary : colors.muted, fontSize: 13 }}>저장</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${outfit.name} 코디 삭제`} accessibilityState={{ disabled: busy || dirty }} disabled={busy || dirty} onPress={() => onDelete(outfit)}
          style={({ pressed }) => ({ width: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: pressed ? colors.surface : 'transparent', opacity: busy || dirty ? 0.4 : 1 })}>
          <Icon name="trash" size={16} color={colors.muted} />
        </Pressable>
      </View>
      {dirty && <Pressable accessibilityRole="button" accessibilityLabel={`${outfit.name} 코디 이름 수정 취소`} disabled={busy} onPress={() => { setDraft(null); setError(null); }} style={{ minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' }}><Text style={{ color: colors.muted, fontSize: 12 }}>이름 수정 취소</Text></Pressable>}
      {error && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 12, lineHeight: 20 }}>{error}</Text>}
      {unavailable && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 12, lineHeight: 20 }}>상태나 분류가 바뀐 옷이 있어요. 아래 코디 이미지를 눌러 수정해 주세요.</Text>}
    </View>
    <View style={{ padding: 16, gap: 10, minHeight: 94 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>{outfit.tags.length ? outfit.tags.slice(0, 4).map((tag) => <Text key={tag} style={{ color: colors.primary, backgroundColor: colors.surface, fontSize: 12, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 4 }}>#{tag}</Text>) : <Text style={{ color: colors.muted, fontSize: 12, paddingVertical: 5 }}>{outfit.occasion || '태그 없음'}</Text>}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}><Text style={{ color: colors.muted, fontSize: 12 }}>계절</Text>{outfit.seasons.length ? outfit.seasons.map((season) => <Text key={season} style={{ color: colors.text, backgroundColor: colors.surface, fontSize: 12, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4 }}>{seasonLabels[season as keyof typeof seasonLabels] ?? season}</Text>) : <Text style={{ color: colors.muted, fontSize: 12 }}>미지정</Text>}</View>
    </View>
    <View style={{ backgroundColor: colors.board, padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {slots.slice(0, 4).map((slot) => {
        const entry = outfit.outfit_items.find((row) => row.slot === slot && row.position === 0);
        const item = entry?.item;
        const available = item && !item.deleted_at;
        const label = slotDisplayLabel(slot, categories.data ?? []);
        return <View key={slot} style={{ flexGrow: 1, flexBasis: '45%', minWidth: 0, borderWidth: 1, borderColor: '#D3D8E3', borderRadius: 7, backgroundColor: colors.background, overflow: 'hidden' }}>
          <Link href={detail} asChild><Pressable accessibilityRole="link" accessibilityLabel={`${outfit.name} 코디 보기 및 수정 · ${label}`} accessibilityHint="코디 편집 화면을 엽니다.">
            <View style={{ aspectRatio: 1.2, justifyContent: 'center', backgroundColor: colors.surface }}>
              {available ? <PhotoFrame aspectRatio={1.2} borderRadius={0} photo={primaryPhoto(photos, item.id)} loading={photoPending} error={photoError} /> : <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center' }}>{item?.deleted_at ? '삭제된 옷' : `${label} 없음`}</Text>}
            </View>
            <Text style={{ color: colors.text, borderTopWidth: 1, borderTopColor: colors.border, textAlign: 'center', paddingVertical: 8, fontSize: 12, fontWeight: '700' }}>{label}</Text>
          </Pressable></Link>
        </View>;
      })}
      {outfit.outfit_items.some((entry) => !slots.slice(0, 4).some((slot) => slot === entry.slot)) && <Link href={detail} style={{ color: colors.muted, fontSize: 11, padding: 4 }}>추가 구성 포함 · 코디 보기</Link>}
    </View>
  </View>;
}

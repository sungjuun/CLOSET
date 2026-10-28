import { useState } from 'react';
import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { useUserId } from '@/providers/AppProviders';
import { WardrobeState } from '../wardrobe/components';
import { useSavedOutfit } from './queries';
import { OutfitEditorScreen } from './EditorScreen';
import type { SavedOutfit } from './catalog';
import { outfitErrorMessage, outfitToDraft } from './repository';

export function OutfitEditScreen({ id }: { id: string }) {
  const owner = useUserId();
  const query = useSavedOutfit(id);
  const [snapshot, setSnapshot] = useState<SavedOutfit | null>(null);
  if (!snapshot && query.data) setSnapshot(query.data);
  // Keep edits mounted across background refreshes and network errors.
  if (snapshot) {
    try { outfitToDraft(snapshot); }
    catch (error) { return <View style={{ gap: 24 }}><Link href="/outfits">저장한 코디로</Link><Text>{outfitErrorMessage(error)}</Text></View>; }
    return <OutfitEditorScreen key={`${owner}:${id}`} initialOutfit={snapshot} />;
  }
  return <View style={{ gap: 24 }}><Link href="/outfits">저장한 코디로</Link>{query.isPending ? <WardrobeState title="코디를 불러오는 중" message="잠시만 기다려 주세요." /> : query.isError ? <WardrobeState title="코디를 불러오지 못했어요" message={outfitErrorMessage(query.error)} retry={() => { void query.refetch(); }} /> : <WardrobeState title="코디를 찾을 수 없어요" message="삭제되었거나 접근할 수 없는 코디입니다." />}</View>;
}

import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { z } from 'zod';
import { useUserId } from '@/providers/AppProviders';
import { OutfitEditScreen } from '@/features/outfits/EditScreen';
import { WardrobeState } from '@/features/wardrobe/components';

export default function OutfitRoute() {
  const owner = useUserId();
  const { outfitId } = useLocalSearchParams<{ outfitId: string | string[] }>();
  if (typeof outfitId !== 'string' || !z.uuid().safeParse(outfitId).success) return <View><WardrobeState title="코디를 찾을 수 없어요" message="주소를 확인해 주세요." /></View>;
  return <OutfitEditScreen key={`${owner}:${outfitId}`} id={outfitId} />;
}

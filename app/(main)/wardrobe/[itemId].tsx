import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { View } from 'react-native';
import { WardrobeDetailScreen } from '@/features/wardrobe/DetailScreen';
import { WardrobeBackLink, WardrobeState } from '@/features/wardrobe/components';

export default function ItemRoute() {
  const { itemId } = useLocalSearchParams<{ itemId: string | string[] }>();
  if (typeof itemId !== 'string' || !z.uuid().safeParse(itemId).success) return <View style={{ gap: 24 }}><WardrobeBackLink /><WardrobeState title="옷을 찾을 수 없어요" message="주소를 확인하거나 내 옷장으로 돌아가 주세요." /></View>;
  return <WardrobeDetailScreen id={itemId} />;
}

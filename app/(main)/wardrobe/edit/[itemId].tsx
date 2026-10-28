import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { z } from 'zod';
import { WardrobeEditScreen } from '@/features/wardrobe/EditScreen';
import { WardrobeBackLink, WardrobeState } from '@/features/wardrobe/components';

export default function EditRoute() {
  const { itemId } = useLocalSearchParams<{ itemId: string | string[] }>();
  if (typeof itemId !== 'string' || !z.uuid().safeParse(itemId).success) return <View style={{ gap: 24 }}><WardrobeBackLink /><WardrobeState title="수정할 옷을 찾을 수 없어요" message="주소를 확인해 주세요." /></View>;
  return <WardrobeEditScreen key={itemId} id={itemId} />;
}

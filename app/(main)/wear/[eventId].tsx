import { Link, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { z } from 'zod';
import { useUserId } from '@/providers/AppProviders';
import { WearEditScreen } from '@/features/wear/EditScreen';
import { WardrobeState } from '@/features/wardrobe/components';
export default function WearRoute() {
  const owner = useUserId();
  const { eventId } = useLocalSearchParams<{ eventId: string | string[] }>();
  if (typeof eventId !== 'string' || !z.uuid().safeParse(eventId).success) return <View style={{ gap: 24 }}><Link href="/calendar">착용 달력으로</Link><WardrobeState title="착용 기록을 찾을 수 없어요" message="주소를 확인해 주세요." /></View>;
  return <WearEditScreen key={`${owner}:${eventId}`} id={eventId} />;
}

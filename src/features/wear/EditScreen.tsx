import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { WardrobeState } from '../wardrobe/components';
import { wearErrorMessage } from './model';
import { useWearEvent } from './queries';
import type { SavedWearEvent } from './repository';
import { WearFormScreen } from './FormScreen';

export function WearEditScreen({ id }: { id: string }) {
  const query = useWearEvent(id);
  const [snapshot, setSnapshot] = useState<SavedWearEvent | null>(null);
  if (!snapshot && query.data) setSnapshot(query.data);
  if (snapshot) return <WearFormScreen initialDate={snapshot.worn_on} initialEvent={snapshot} />;
  return <View style={{ gap: 24 }}><Link href="/calendar">착용 달력으로</Link>{query.isPending ? <WardrobeState title="착용 기록을 불러오는 중" message="잠시만 기다려 주세요." /> : query.isError ? <WardrobeState title="기록을 불러오지 못했어요" message={wearErrorMessage(query.error)} retry={() => { void query.refetch(); }} /> : <WardrobeState title="착용 기록을 찾을 수 없어요" message="삭제되었거나 접근할 수 없는 기록입니다." />}</View>;
}

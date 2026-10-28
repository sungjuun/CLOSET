import { View } from 'react-native';
import { useState } from 'react';
import { WardrobeBackLink, WardrobeState } from './components';
import { useWardrobeItem } from './queries';
import { wardrobeErrorMessage } from './errors';
import { WardrobeForm } from './WardrobeForm';
import type { WardrobeItem } from './types';

export function WardrobeEditScreen({ id }: { id: string }) {
  const query = useWardrobeItem(id);
  const [snapshot, setSnapshot] = useState<WardrobeItem | null>(null);
  if (!snapshot && query.data) setSnapshot(query.data);
  // Background errors must not unmount the form and discard its draft.
  if (snapshot) return <WardrobeForm key={id} initialItem={snapshot} reload={async () => { const result = await query.refetch(); if (result.isError) throw result.error; return result.data ?? null; }} />;
  return <View style={{ gap: 24 }}><WardrobeBackLink />{query.isPending ? <WardrobeState title="옷 정보를 불러오는 중" message="잠시만 기다려 주세요." /> : query.isError ? <WardrobeState title="옷 정보를 불러오지 못했어요" message={wardrobeErrorMessage(query.error)} retry={() => { void query.refetch(); }} /> : <WardrobeState title="수정할 옷을 찾을 수 없어요" message="삭제되었거나 접근할 수 없는 옷입니다. 내 옷장과 휴지통에서 확인해 주세요." />}</View>;
}

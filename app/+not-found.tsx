import { Link } from 'expo-router';
import { View } from 'react-native';
import { FoundationScreen } from '@/components/ui/FoundationScreen';

export default function NotFound() {
  return <View style={{ gap: 24 }}><FoundationScreen eyebrow="PAGE NOT FOUND" title="페이지를 찾을 수 없어요" description="주소를 다시 확인해 주세요." next="아래 링크로 내 옷장에 돌아갈 수 있어요." /><Link href="/wardrobe">내 옷장으로</Link></View>;
}

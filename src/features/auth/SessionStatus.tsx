import { Text, View } from 'react-native';
import { useAuth } from '@/providers/AppProviders';
import { ActionButton } from '@/components/ui/ActionButton';
import { useTheme } from '@/theme/useTheme';

export function SessionStatus() {
  const auth = useAuth();
  const colors = useTheme();
  return <View style={{ gap: 16, paddingVertical: 40 }}>
    <Text accessibilityRole="alert" style={{ color: colors.text }}>{auth.failed ? '세션을 확인하지 못했습니다.' : '세션 확인 중…'}</Text>
    {auth.failed && <ActionButton label="다시 시도" onPress={auth.retry} />}
  </View>;
}

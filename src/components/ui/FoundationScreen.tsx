import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { radius, spacing } from '@/theme/tokens';

type Props = { eyebrow: string; title: string; description: string; next: string };

export function FoundationScreen({ eyebrow, title, description, next }: Props) {
  const colors = useTheme();
  return (
    <View style={styles.content}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.muted }]}>{description}</Text>
      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.panelTitle, { color: colors.text }]}>공간을 준비하고 있어요</Text>
        <Text style={[styles.description, { color: colors.muted }]}>{next}</Text>
        <Text style={[styles.note, { color: colors.muted }]}>현재는 프로젝트 기반을 확인하는 준비 화면입니다.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  title: { fontSize: 32, fontWeight: '700', letterSpacing: -1 },
  description: { fontSize: 15, lineHeight: 24 },
  panel: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.card, borderWidth: 1, gap: spacing.md },
  panelTitle: { fontSize: 20, fontWeight: '600' },
  note: { fontSize: 12, lineHeight: 20 },
});

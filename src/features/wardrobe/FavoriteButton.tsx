import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { wardrobeErrorMessage } from './errors';
import { useWardrobeActions } from './queries';
import type { WardrobeItem } from './types';
import { Icon } from '@/components/ui/Icon';

export function FavoriteButton({ item, compact = false, disabled = false }: { item: WardrobeItem; compact?: boolean; disabled?: boolean }) {
  const colors = useTheme();
  const actions = useWardrobeActions();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function change() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await actions.perform((repository, signal) => repository.setFavorite(item.id, item.updated_at, !item.is_favorite, signal)); }
    catch (cause) { if (actions.isActive()) setError(wardrobeErrorMessage(cause)); }
    finally { lock.current = false; if (actions.isActive()) setBusy(false); }
  }
  const label = `${item.name} 즐겨찾기 ${item.is_favorite ? '해제' : '추가'}`;
  return <View style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} aria-pressed={item.is_favorite} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={() => { void change(); }} style={{ minWidth: 44, minHeight: 44, padding: compact ? 4 : 12, borderRadius: compact ? 24 : 10, borderWidth: compact ? 0 : 1, borderColor: colors.border, backgroundColor: compact ? 'transparent' : colors.background, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', opacity: disabled || busy ? 0.5 : 1 }}><View style={{ width: compact ? 34 : 24, height: compact ? 34 : 24, borderRadius: 20, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}><Icon name="heart" size={compact ? 21 : 20} color={item.is_favorite ? colors.primary : colors.muted} filled={item.is_favorite} /></View>{!compact && <Text style={{ color: item.is_favorite ? colors.primary : colors.muted, fontSize: 15 }}>{`즐겨찾기 ${item.is_favorite ? '해제' : '추가'}`}</Text>}</Pressable>
    {error && <Text accessibilityRole="alert" accessibilityLabel={error} style={compact ? { position: 'absolute', right: 0, top: 48, width: 120, padding: 8, backgroundColor: colors.surface, color: '#A52727', fontSize: 12 } : { color: '#A52727', lineHeight: 22 }}>{compact ? '변경하지 못했어요. 새로고침 후 다시 시도해 주세요.' : error}</Text>}
  </View>;
}

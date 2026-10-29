import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import type { MemberCategory } from './model';
import { categoryDragDestination, categoryDragLayouts, categoryDragShift, categoryDragTarget, droppedCategoryOrder, type CategoryRowLayout } from './drag';
import { CategoryDragHandle } from './CategoryDragHandle';

type Drag = { items: MemberCategory[]; layouts: CategoryRowLayout[]; from: number; to: number; dy: number };
type Props = {
  items: MemberCategory[]; enabled: boolean; disabled: boolean;
  sidebar?: boolean;
  renderRow: (item: MemberCategory, handle: ReactNode) => ReactNode;
  onReorder: (expected: string[], order: string[]) => Promise<boolean>;
  onDragChange: (dragging: boolean) => void;
};

export function SortableCategoryList({ items, enabled, disabled, sidebar = false, renderRow, onReorder, onDragChange }: Props) {
  const colors = useTheme();
  const containerId = useId();
  const heights = useRef(new Map<string, number>());
  const session = useRef<Drag | null>(null);
  const alive = useRef(true);
  const saving = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState<MemberCategory[] | null>(null);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; session.current = null; onDragChange(false); };
  }, [onDragChange]);
  function start(index: number) {
    if (!enabled || disabled || saving.current || session.current) return false;
    // Recompute positions from the current order. Web onLayout may only report
    // size changes, so a previous DOM reorder need not emit fresh y values.
    const metrics = categoryDragLayouts(items.map((item) => heights.current.get(item.slug) ?? 0));
    if (!metrics?.length) return false;
    const next: Drag = { items: [...items], layouts: metrics, from: index, to: index, dy: 0 };
    session.current = next; setDrag(next); onDragChange(true);
    setAnnouncement(`${items[index]!.label_ko} 선택. 위아래로 이동한 뒤 놓아 주세요.`);
    return true;
  }
  function update(dy: number) {
    const current = session.current;
    if (!current) return;
    const first = current.layouts[0]!; const last = current.layouts[current.layouts.length - 1]!;
    const source = current.layouts[current.from]!;
    const offset = Math.max(first.y - source.y, Math.min(dy, last.y + last.height - source.y - source.height));
    const next = { ...current, dy: offset, to: categoryDragTarget(current.layouts, current.from, dy) };
    session.current = next; setDrag(next);
    if (next.to !== current.to) setAnnouncement(`${current.items[current.from]!.label_ko}, ${next.to + 1}번째 위치`);
  }
  function step(direction: -1 | 1) {
    const current = session.current;
    if (!current) return;
    const to = Math.max(0, Math.min(current.items.length - 1, current.to + direction));
    const next = { ...current, to, dy: categoryDragDestination(current.layouts, current.from, to) };
    session.current = next; setDrag(next);
    setAnnouncement(`${current.items[current.from]!.label_ko}, ${to + 1}번째 위치`);
  }
  function cancel() {
    if (!session.current) return;
    session.current = null; setDrag(null); onDragChange(false); setAnnouncement('순서 변경을 취소했어요.');
  }
  async function finish() {
    const current = session.current;
    if (!current) return;
    session.current = null; setDrag(null); onDragChange(false);
    const expected = current.items.map((row) => row.slug);
    const order = droppedCategoryOrder(expected, current.items[current.from]!.slug, current.to);
    if (!order) { setAnnouncement('순서를 유지했어요.'); return; }
    if (items.map((row) => row.slug).join('|') !== expected.join('|')) { setAnnouncement('목록이 바뀌어 드래그를 취소했어요. 다시 시도해 주세요.'); return; }
    saving.current = true;
    setPending(order.map((id) => current.items.find((row) => row.slug === id)!));
    try {
      const success = await onReorder(expected, order);
      if (alive.current) setAnnouncement(success ? '변경한 순서를 저장했어요.' : '저장 결과를 확인해 주세요.');
    } catch {
      if (alive.current) setAnnouncement('순서를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally { saving.current = false; if (alive.current) setPending(null); }
  }
  const shown = drag?.items ?? pending ?? items;
  return <View nativeID={containerId}>
    {shown.map((item, index) => {
      const active = drag?.from === index;
      const offset = drag ? active ? drag.dy : categoryDragShift(index, drag.from, drag.to, drag.layouts[drag.from]!.height) : 0;
      const handle = enabled ? <CategoryDragHandle label={item.label_ko} containerId={containerId} active={active} position={(active ? drag!.to : index) + 1} count={shown.length}
        disabled={disabled || shown.length < 2 || Boolean(pending) || Boolean(drag && !active)} onStart={() => start(index)} onMove={update} onStep={step} onEnd={() => { void finish(); }} onCancel={cancel} /> : null;
      return <View key={item.slug} onLayout={(event) => { if (!session.current) heights.current.set(item.slug, event.nativeEvent.layout.height); }}
        style={{ borderTopWidth: sidebar ? 0 : 1, borderTopColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.surface : sidebar ? 'transparent' : colors.background, transform: [{ translateY: offset }], zIndex: active ? 2 : 0, elevation: active ? 4 : 0 }}>
        {renderRow(item, handle)}
      </View>;
    })}
    <Text accessibilityLiveRegion="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}>{announcement}</Text>
  </View>;
}

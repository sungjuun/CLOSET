import { useEffect, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/theme/useTheme';
import type { CategoryDragHandleProps } from './CategoryDragHandle.types';

function createDragResponder(initial: CategoryDragHandleProps) {
  let latest = initial;
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => !latest.disabled,
    onPanResponderGrant: () => { latest.onStart(); },
    onPanResponderMove: (_event, gesture) => {
      if (gesture.numberActiveTouches === 1) latest.onMove(gesture.dy); else latest.onCancel();
    },
    onPanResponderRelease: (_event, gesture) => { latest.onMove(gesture.dy); latest.onEnd(); },
    onPanResponderTerminate: () => latest.onCancel(),
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  });
  return { handlers: pan.panHandlers, update: (next: CategoryDragHandleProps) => { latest = next; } };
}

export function CategoryDragHandle(props: CategoryDragHandleProps) {
  const colors = useTheme();
  const [responder] = useState(() => createDragResponder(props));
  useEffect(() => { responder.update(props); }, [responder, props]);
  return <View {...responder.handlers} accessible accessibilityRole="adjustable" accessibilityLabel={`${props.label} 순서`}
    accessibilityHint="손잡이를 잡고 위아래로 이동하세요." accessibilityState={{ disabled: props.disabled }} accessibilityValue={{ min: 1, max: props.count, now: props.position }}
    accessibilityActions={[{ name: 'increment', label: '아래로 이동' }, { name: 'decrement', label: '위로 이동' }]}
    onAccessibilityAction={(event) => {
      if (props.disabled || !['increment', 'decrement'].includes(event.nativeEvent.actionName) || !props.onStart()) return;
      props.onStep(event.nativeEvent.actionName === 'increment' ? 1 : -1); props.onEnd();
    }} style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: props.active ? colors.surface : 'transparent', opacity: props.disabled ? 0.3 : 1 }}>
    <Icon name="grip" size={20} color={props.active ? colors.primary : colors.muted} />
  </View>;
}

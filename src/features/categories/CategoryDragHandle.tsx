import { useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/theme/useTheme';
import type { CategoryDragHandleProps } from './CategoryDragHandle.types';

export function CategoryDragHandle(props: CategoryDragHandleProps) {
  const colors = useTheme();
  const gesture = useRef<{ pointer: number; startY: number; anchor: HTMLElement | null; anchorTop: number } | 'keyboard' | null>(null);
  const cancel = () => { if (gesture.current) { gesture.current = null; props.onCancel(); } };
  return <button type="button" disabled={props.disabled} aria-label={`${props.label} 순서 드래그, ${props.position}/${props.count}`} aria-pressed={props.active}
    title="드래그로 순서 변경 · Space로 잡기/놓기 · 위아래 방향키로 이동 · Escape로 취소"
    style={{ width: 44, minHeight: 44, flexShrink: 0, border: 0, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: props.active ? colors.surface : 'transparent', color: colors.muted, cursor: props.disabled ? 'default' : props.active ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', opacity: props.disabled ? 0.3 : 1 }}
    onPointerDown={(event) => {
      if (props.disabled || event.button !== 0 || !event.isPrimary || gesture.current || !props.onStart()) return;
      event.preventDefault(); event.currentTarget.focus();
      const anchor = event.currentTarget.ownerDocument.getElementById(props.containerId);
      gesture.current = { pointer: event.pointerId, startY: event.clientY, anchor, anchorTop: anchor?.getBoundingClientRect().top ?? 0 };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      const current = gesture.current;
      if (current && current !== 'keyboard' && current.pointer === event.pointerId) {
        event.preventDefault(); props.onMove(event.clientY - current.startY + current.anchorTop - (current.anchor?.getBoundingClientRect().top ?? current.anchorTop));
      }
    }}
    onPointerUp={(event) => {
      const current = gesture.current;
      if (!current || current === 'keyboard' || current.pointer !== event.pointerId) return;
      props.onMove(event.clientY - current.startY + current.anchorTop - (current.anchor?.getBoundingClientRect().top ?? current.anchorTop));
      gesture.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      props.onEnd();
    }}
    onPointerCancel={cancel} onLostPointerCapture={cancel}
    onBlur={() => { if (gesture.current === 'keyboard') cancel(); }}
    onKeyDown={(event) => {
      if (props.disabled) return;
      if (event.key === 'Escape') { event.preventDefault(); cancel(); return; }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault(); if (event.repeat) return;
        if (gesture.current === 'keyboard') { gesture.current = null; props.onEnd(); }
        else if (!gesture.current && props.onStart()) gesture.current = 'keyboard';
      } else if (gesture.current === 'keyboard' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault(); props.onStep(event.key === 'ArrowUp' ? -1 : 1);
      }
    }}><Icon name="grip" size={20} color={props.active ? colors.primary : colors.muted} /></button>;
}

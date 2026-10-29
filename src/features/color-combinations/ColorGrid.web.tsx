import { useRef } from 'react';
import { useTheme } from '@/theme/useTheme';
import { tone } from './finder';
import type { ColorGridProps } from './ColorGrid.types';

export function ColorGrid({ colors: choices, selected, onSelect, columns, label }: ColorGridProps) {
  const colors = useTheme(); const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return <div role="group" aria-label={label} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 8 }}>
    {choices.map((color, index) => <button key={color.id} type="button" aria-label={`${label} ${color.label}`} aria-pressed={selected === color.id} tabIndex={selected === color.id || (!selected && index === 0) ? 0 : -1} ref={(element) => { buttons.current[index] = element; }}
      onClick={() => onSelect(color.id)} onKeyDown={(event) => {
        let next: number;
        if (event.key === 'ArrowRight') next = (index + 1) % choices.length;
        else if (event.key === 'ArrowLeft') next = (index + choices.length - 1) % choices.length;
        else if (event.key === 'ArrowDown') next = (index + columns) % choices.length;
        else if (event.key === 'ArrowUp') next = (index - columns + choices.length) % choices.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = choices.length - 1;
        else return;
        event.preventDefault(); buttons.current[next]?.focus();
      }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minHeight: 78, minWidth: 0, padding: 4, border: 0, background: 'transparent', color: selected === color.id ? colors.text : colors.muted, fontFamily: 'inherit', fontWeight: selected === color.id ? 700 : 400, fontSize: 11, lineHeight: '16px', cursor: 'pointer', borderRadius: 6 }}>
      <span aria-hidden="true" style={{ boxSizing: 'border-box', width: 44, height: 44, padding: 4, border: `1.5px solid ${selected === color.id ? colors.primary : 'transparent'}`, borderRadius: '50%', flexShrink: 0 }}><span style={{ boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: '50%', background: color.hex, border: '1px solid #AEB4B5', color: tone(color.hex).lightness > 0.6 ? '#222530' : '#FFFFFF', fontSize: 21, fontWeight: 800 }}>{selected === color.id ? '✓' : ''}</span></span>
      <span>{color.label}</span>
    </button>)}
  </div>;
}

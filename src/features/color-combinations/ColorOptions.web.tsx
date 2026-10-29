import { useRef } from 'react';
import { useTheme } from '@/theme/useTheme';
import { baseColorIds, guideColors } from './palettes';
import type { ColorOptionsProps } from './ColorOptions.types';

export function ColorOptions({ selected, onSelect, columns }: ColorOptionsProps) {
  const colors = useTheme();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return <div role="radiogroup" aria-label="기준 색상" style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 12 }}>
    {baseColorIds.map((id, index) => <button key={id} type="button" role="radio" aria-label={`${guideColors[id].label} 기준 색상`} aria-checked={selected === id} tabIndex={selected === id ? 0 : -1} ref={(element) => { buttons.current[index] = element; }}
      onClick={() => onSelect(id)} onKeyDown={(event) => {
        let next: number;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % baseColorIds.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + baseColorIds.length - 1) % baseColorIds.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = baseColorIds.length - 1;
        else return;
        event.preventDefault();
        onSelect(baseColorIds[next]!);
        buttons.current[next]?.focus();
      }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 90, minWidth: 0, border: `2px solid ${selected === id ? colors.primary : colors.border}`, borderRadius: 12, padding: 10, backgroundColor: colors.background, color: colors.text, fontFamily: 'inherit', fontSize: 13, fontWeight: selected === id ? 700 : 500, cursor: 'pointer' }}>
      <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', backgroundColor: guideColors[id].hex, border: `1px solid ${colors.border}`, boxSizing: 'border-box', flexShrink: 0 }} />
      <span>{guideColors[id].label}{selected === id ? ' ✓' : ''}</span>
    </button>)}
  </div>;
}

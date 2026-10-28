import { useId } from 'react';
import { useTheme } from '@/theme/useTheme';
import type { SelectFieldProps } from './SelectField.types';
import { Icon } from './Icon';

export function SelectField({ label, value, options, onChange, disabled, hideLabel = false, compact = false, borderless = false }: SelectFieldProps) {
  const colors = useTheme();
  const id = useId();
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
    {!hideLabel && <label htmlFor={id} style={{ color: compact ? colors.muted : colors.text, fontSize: compact ? 13 : 14, fontWeight: compact ? 400 : 600 }}>{label}</label>}
    <div style={{ position: 'relative', width: '100%' }}>
    <select aria-label={label} id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} style={{ appearance: 'none', width: '100%', minWidth: 0, height: borderless ? 36 : compact ? 42 : 48, borderRadius: compact ? 7 : 10, border: `1px solid ${borderless ? 'transparent' : colors.border}`, padding: '0 34px 0 12px', color: borderless ? colors.muted : colors.text, backgroundColor: colors.background, fontFamily: 'inherit', fontSize: compact ? 14 : 16, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    <div aria-hidden style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}><Icon name="chevron" size={15} color={colors.muted} /></div>
    </div>
  </div>;
}

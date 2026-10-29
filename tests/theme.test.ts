import { describe, expect, it } from 'vitest';
import { themes, themeNames } from '../src/theme/tokens';

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe('dark theme', () => {
  it('offers Dark in place of Brown', () => expect(themeNames).toEqual(['white', 'beige', 'dark']));
  it('keeps text, links, errors and primary buttons readable on dark surfaces', () => {
    for (const background of [themes.dark.background, themes.dark.surface, themes.dark.board]) {
      for (const foreground of [themes.dark.text, themes.dark.muted, themes.dark.primary, themes.dark.danger]) {
        expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(themes.dark.onPrimary, themes.dark.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#FFFFFF', themes.dark.brand)).toBeGreaterThanOrEqual(4.5);
  });
});

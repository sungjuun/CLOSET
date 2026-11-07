import type { Json } from '../../types/database.generated';
import { MeasurementInputError } from './model';

export const footSides = [
  { key: 'left', label: '왼발' },
  { key: 'right', label: '오른발' },
] as const;

export const pairedShoeGroups = [
  { key: 'scan', title: 'Volumental 스캔', fields: [
    { key: 'scan_length', label: '발 길이', unit: 'mm' },
    { key: 'scan_width', label: '발볼 너비', unit: 'mm' },
    { key: 'scan_ball_girth', label: '발볼 둘레', unit: 'mm' },
    { key: 'scan_heel_width', label: '발꿈치 너비', unit: 'mm' },
    { key: 'scan_instep_height', label: '발등 높이', unit: 'mm' },
    { key: 'scan_instep_girth', label: '발등 둘레', unit: 'mm' },
    { key: 'scan_eu', label: 'EU 발 사이즈', unit: '' },
  ] },
  { key: 'fitting', title: '플릿러너 측정·보정', fields: [
    { key: 'fitting_length', label: '보정 발 길이', unit: 'mm' },
    { key: 'fitting_us', label: 'US 발 사이즈', unit: '' },
    { key: 'fitting_width', label: '볼 너비 등급', unit: '' },
    { key: 'fitting_arch', label: '아치 타입', unit: '' },
    { key: 'fitting_contact', label: '착지 타입', unit: '' },
    { key: 'fitting_running', label: '러닝 회내 타입', unit: '' },
  ] },
] as const;

export const recommendedShoeFields = [
  { key: 'recommended_length', label: '신발 사이즈', unit: 'mm' },
  { key: 'recommended_us', label: 'US 신발 사이즈', unit: '' },
  { key: 'recommended_width', label: '신발 너비', unit: '' },
  { key: 'recommended_type', label: '신발 타입', unit: '' },
] as const;

type FootSide = typeof footSides[number]['key'];
type PairedFieldKey = typeof pairedShoeGroups[number]['fields'][number]['key'];
export type ShoeKey = `${PairedFieldKey}_${FootSide}` | typeof recommendedShoeFields[number]['key'];
export type ShoeDraft = Partial<Record<ShoeKey, string>>;
export type ShoeFit = Partial<Record<ShoeKey, string | number>>;

export function footFieldKey(key: PairedFieldKey, side: FootSide): `${PairedFieldKey}_${FootSide}` {
  return `${key}_${side}`;
}

const fields = [
  ...pairedShoeGroups.flatMap((group) => group.fields.flatMap((field) => footSides.map((side) => ({
    key: footFieldKey(field.key, side.key), label: `${group.title} ${side.label} ${field.label}`, unit: field.unit,
  })))),
  ...recommendedShoeFields,
];

export function shoeDraft(value: Json | undefined): ShoeDraft {
  const draft: ShoeDraft = {};
  if (typeof value !== 'object' || !value || Array.isArray(value)) return draft;
  for (const { key, unit } of fields) {
    const entry = value[key];
    if (unit === 'mm') {
      if (typeof entry === 'number' && Number.isInteger(entry) && entry >= 1 && entry <= 500) draft[key] = String(entry);
    } else if (typeof entry === 'string' && entry.trim() && entry.length <= 48) {
      draft[key] = entry.trim();
    }
  }
  return draft;
}

export function parseShoeDraft(draft: ShoeDraft): ShoeFit | null {
  const values: ShoeFit = {};
  for (const { key, label, unit } of fields) {
    const input = draft[key]?.trim();
    if (!input) continue;
    if (unit === 'mm') {
      const number = Number(input);
      if (!/^\d+$/.test(input) || number < 1 || number > 500) {
        throw new MeasurementInputError('shoes', `${label} 값을 1~500 mm 사이의 정수로 입력해 주세요.`);
      }
      values[key] = number;
    } else {
      if (input.length > 48) throw new MeasurementInputError('shoes', `${label} 값을 48자 이하로 입력해 주세요.`);
      values[key] = input;
    }
  }
  return Object.keys(values).length ? values : null;
}

import { z } from 'zod';
import type { Tables } from '../../types/database.generated';

export const measurementGroups = [
  { key: 'basic', label: '기본', unit: 'cm', max: 300, fields: [
    { key: 'height_cm', label: '키' },
    { key: 'chest_cm', label: '가슴둘레' },
    { key: 'waist_cm', label: '허리둘레' },
  ] },
  { key: 'outerwear', label: '아우터', unit: 'cm', max: 300, fields: [
    { key: 'outerwear_length_cm', label: '총장' },
    { key: 'outerwear_shoulder_width_cm', label: '어깨너비' },
    { key: 'outerwear_chest_width_cm', label: '가슴단면' },
    { key: 'outerwear_sleeve_length_cm', label: '소매길이' },
  ] },
  { key: 'tops', label: '상의', unit: 'cm', max: 300, fields: [
    { key: 'top_length_cm', label: '총장' },
    { key: 'top_shoulder_width_cm', label: '어깨너비' },
    { key: 'top_chest_width_cm', label: '가슴단면' },
    { key: 'top_sleeve_length_cm', label: '소매길이' },
  ] },
  { key: 'bottoms', label: '하의', unit: 'cm', max: 300, fields: [
    { key: 'bottom_length_cm', label: '총장' },
    { key: 'bottom_waist_width_cm', label: '허리단면' },
    { key: 'bottom_hip_width_cm', label: '엉덩이단면' },
    { key: 'bottom_thigh_width_cm', label: '허벅지단면' },
    { key: 'bottom_rise_cm', label: '밑위' },
    { key: 'bottom_hem_width_cm', label: '밑단단면' },
  ] },
  { key: 'shoes', label: '신발', unit: 'mm', max: 500, fields: [
    { key: 'foot_length_mm', label: '발 길이' },
  ] },
] as const;

type MeasurementGroup = typeof measurementGroups[number];
export type MeasurementGroupKey = MeasurementGroup['key'];
type MeasurementKey = MeasurementGroup['fields'][number]['key'];
export type BodyDraft = Record<MeasurementKey, string>;
export type BodyValues = Record<MeasurementKey, number | null>;
export type BodyMeasurements = Tables<'member_body_measurements'>;
export type BrandSize = Tables<'member_brand_sizes'>;

export function bodyDraft(saved: BodyMeasurements | null): BodyDraft {
  const entries = measurementGroups.flatMap(({ fields }) => fields.map(({ key }) => [key, String(saved?.[key] ?? '')]));
  return Object.fromEntries(entries) as BodyDraft;
}

export class MeasurementInputError extends Error {
  constructor(readonly group: MeasurementGroupKey, message: string) {
    super(message);
  }
}

export function parseBodyDraft(draft: BodyDraft): BodyValues {
  const values = {} as BodyValues;
  for (const group of measurementGroups) {
    const whole = group.unit === 'mm';
    const format = whole ? /^\d+$/ : /^\d+(?:\.\d)?$/;
    for (const { key, label } of group.fields) {
      const input = draft[key].trim().replace(',', '.');
      if (!input) {
        values[key] = null;
        continue;
      }
      const value = Number(input);
      if (!format.test(input) || value < 1 || value > group.max) {
        const precision = whole ? '정수' : '소수 첫째 자리까지';
        throw new MeasurementInputError(group.key, `${group.label}의 ${label} 값을 1~${group.max} ${group.unit} 범위로 입력해 주세요 (${precision}).`);
      }
      values[key] = value;
    }
  }
  return values;
}

export const brandSizeSchema = z.object({
  brand_name: z.string().trim().min(1, '브랜드명을 입력해 주세요.').max(120),
  garment_type: z.string().trim().min(1, '옷 종류를 입력해 주세요.').max(80),
  size_label: z.string().trim().min(1, '사이즈를 입력해 주세요.').max(60),
  fit_note: z.string().trim().max(200),
});

export type BrandSizeDraft = z.infer<typeof brandSizeSchema>;

export function prioritizeBrand(records: readonly BrandSize[], brandName: string) {
  const name = brandName.trim().toLocaleLowerCase();
  if (!name) return records;
  const matches = (record: BrandSize) => record.brand_name.trim().toLocaleLowerCase() === name;
  return [...records.filter(matches), ...records.filter((record) => !matches(record))];
}

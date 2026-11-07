import { z } from 'zod';
import type { Tables } from '../../types/database.generated';

export const measurementFields = [
  { key: 'height_cm', label: '키', unit: 'cm', max: 300 },
  { key: 'chest_cm', label: '가슴둘레', unit: 'cm', max: 300 },
  { key: 'waist_cm', label: '허리둘레', unit: 'cm', max: 300 },
  { key: 'foot_length_mm', label: '발 길이', unit: 'mm', max: 500 },
] as const;

type MeasurementKey = typeof measurementFields[number]['key'];
export type BodyDraft = Record<MeasurementKey, string>;
export type BodyValues = Record<MeasurementKey, number | null>;
export type BodyMeasurements = Tables<'member_body_measurements'>;
export type BrandSize = Tables<'member_brand_sizes'>;

export function bodyDraft(saved: BodyMeasurements | null): BodyDraft {
  return {
    height_cm: String(saved?.height_cm ?? ''),
    chest_cm: String(saved?.chest_cm ?? ''),
    waist_cm: String(saved?.waist_cm ?? ''),
    foot_length_mm: String(saved?.foot_length_mm ?? ''),
  };
}

export function parseBodyDraft(draft: BodyDraft): BodyValues {
  const values: BodyValues = { height_cm: null, chest_cm: null, waist_cm: null, foot_length_mm: null };
  for (const field of measurementFields) {
    const input = draft[field.key].trim().replace(',', '.');
    if (!input) continue;
    const format = field.unit === 'mm' ? /^\d+$/ : /^\d+(?:\.\d)?$/;
    const value = Number(input);
    if (!format.test(input) || value < 1 || value > field.max) {
      const precision = field.unit === 'mm' ? '정수' : '소수 첫째 자리까지';
      throw new Error(`${field.label}는 1~${field.max}${field.unit} 사이의 값으로 입력해 주세요 (${precision}).`);
    }
    values[field.key] = value;
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

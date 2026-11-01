import { z } from 'zod';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { sha256 } from './hash';
import { rasterKind } from '../wardrobe/photos/model';

export const maxArchiveBytes = 100 * 1024 * 1024;
export const maxDataBytes = 16 * 1024 * 1024;
export const maxFileBytes = 5 * 1024 * 1024;
export const tableNames = ['categories', 'category_preferences', 'category_deletions', 'brands', 'wardrobe_items', 'outfits', 'outfit_items', 'wear_events', 'wear_event_items', 'item_images', 'outfit_render_assets', 'outfit_presentations', 'color_pair_favorites'] as const;
export type TableName = typeof tableNames[number];
const scalar = z.union([z.string().max(20000), z.number().finite(), z.boolean(), z.null(), z.array(z.string().max(200)).max(200)]);
export const rowSchema = z.record(z.string().max(100), scalar);
export type BackupRow = z.infer<typeof rowSchema>;
const tablesSchema = z.object(Object.fromEntries(tableNames.map(name => [name, z.array(rowSchema).max(10000)])) as Record<TableName, z.ZodArray<typeof rowSchema>>).strict();
const fileSchema = z.object({ bucket: z.enum(['wardrobe-private', 'brand-private', 'outfit-renders-private']), path: z.string().max(250), file: z.string().max(300), mime: z.enum(['image/png', 'image/jpeg', 'image/webp']), size: z.number().int().min(1).max(maxFileBytes), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const backupSchema = z.object({ format: z.literal('closet-backup'), version: z.literal(1), kind: z.enum(['data', 'full']), createdAt: z.iso.datetime(), owner: z.uuid(), profile: rowSchema, tables: tablesSchema, files: z.array(fileSchema).max(500) }).strict();
export type Backup = z.infer<typeof backupSchema>;
export type BackupFile = Backup['files'][number];
export type LoadedBackup = { backup: Backup; files: Record<string, Uint8Array> };
export class BackupError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function backupDate(iso: string) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
export function backupErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'owner' || code === '42501' || code === 'session_changed') return '백업을 만든 계정으로 로그인해 주세요. 다른 계정의 백업은 복원할 수 없어요.';
  if (code === 'PT409' || code === '23505') return '현재 자료와 백업의 내용이 달라 복원을 중단했어요. 기존 자료는 덮어쓰지 않습니다. 최신 백업을 선택해 주세요.';
  if (code === 'changed') return '백업 중 자료가 변경됐어요. 잠시 후 다시 백업해 주세요.';
  if (code === 'limit' || code === '54000') return '백업은 파일 100MiB, 사진 500개, 표별 10,000개 자료까지 지원해요.';
  if (code === 'invalid' || code === '22023' || code === '23514' || code === '23503') return 'CLOSET 백업 형식·연결 정보가 올바르지 않거나 파일이 손상됐어요.';
  if (code === 'media') return '사진 파일을 확인하지 못했어요. 데이터는 복원되었을 수 있습니다. 같은 파일로 다시 시도하면 완료된 자료를 건너뛰고 이어서 복원합니다.';
  if (code === 'missing_media') return '백업할 사진을 읽지 못했어요. 불완전한 백업은 저장하지 않았습니다. 연결과 사진 상태를 확인해 주세요.';
  if (code === 'sharing') return '이 기기에서 파일 공유를 사용할 수 없어요. 웹에서 백업해 주세요.';
  return '작업을 완료하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요. 복원 중이었다면 같은 파일로 다시 시도할 수 있어요.';
}
export function mediaReferences(backup: Pick<Backup, 'tables'>) {
  const refs: { bucket: BackupFile['bucket']; path: string }[] = [];
  for (const row of backup.tables.item_images) refs.push({ bucket: 'wardrobe-private', path: String(row.storage_path) });
  for (const row of backup.tables.brands) if (row.image_path) refs.push({ bucket: 'brand-private', path: String(row.image_path) });
  for (const row of backup.tables.outfit_render_assets) refs.push({ bucket: 'outfit-renders-private', path: String(row.storage_path) });
  return refs;
}
export function validateBackup(value: unknown, owner: string): Backup {
  const parsed = backupSchema.safeParse(value);
  if (!parsed.success) throw new BackupError('invalid');
  const backup = parsed.data;
  if (backup.owner !== owner || backup.profile.id !== owner || tableNames.some(table => backup.tables[table].some(row => row.user_id !== owner))) throw new BackupError('owner');
  if (tableNames.reduce((count, table) => count + backup.tables[table].length, 0) > 25000) throw new BackupError('limit');
  const refs = mediaReferences(backup);
  const expected = new Set(refs.map(ref => `${ref.bucket}/${ref.path}`));
  if (expected.size !== refs.length || refs.length > 500 || (backup.kind === 'data' && refs.length)) throw new BackupError('invalid');
  const seen = new Set<string>();
  for (const file of backup.files) {
    const key = `${file.bucket}/${file.path}`;
    const pattern = file.bucket === 'wardrobe-private' ? /^[a-f0-9-]{36}\/items\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(?:jpg|jpeg|png|webp)$/ : file.bucket === 'brand-private' ? /^[a-f0-9-]{36}\/brands\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/ : /^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.png$/;
    if (!file.path.startsWith(`${owner}/`) || !pattern.test(file.path) || file.file !== `files/${key}` || !expected.has(key) || seen.has(key)) throw new BackupError('invalid');
    const extension = file.path.split('.').pop();
    if (file.mime !== (extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`)) throw new BackupError('invalid');
    seen.add(key);
  }
  if (seen.size !== expected.size || (backup.kind === 'data' && backup.files.length)) throw new BackupError('invalid');
  if (strToU8(JSON.stringify(backup)).length > maxDataBytes) throw new BackupError('limit');
  return backup;
}
export function withoutMedia(backup: Backup): Backup {
  return { ...backup, kind: 'data', files: [], tables: { ...backup.tables, item_images: [], outfit_render_assets: [], brands: backup.tables.brands.map(row => ({ ...row, image_path: null })), outfit_presentations: backup.tables.outfit_presentations.map(row => ({ ...row, render_id: null })) } };
}
export function csv(rows: BackupRow[]) {
  const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row)))).sort();
  const cell = (value: unknown) => {
    let text = value === null || value === undefined ? '' : Array.isArray(value) ? JSON.stringify(value) : String(value);
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [columns.map(cell).join(','), ...rows.map(row => columns.map(column => cell(row[column])).join(','))].join('\r\n');
}
export function csvArchive(backup: Backup) {
  const files: Record<string, Uint8Array> = { 'README.txt': strToU8('CLOSET CSV 열람용 자료입니다. 복원에는 JSON 또는 전체 ZIP을 사용하세요. 금액 단위: KRW. 계정 인증정보는 포함하지 않습니다.') };
  for (const table of tableNames) files[`csv/${table}.csv`] = strToU8(csv(backup.tables[table]));
  files['csv/profile.csv'] = strToU8(csv([backup.profile]));
  return zipSync(files, { level: 1 });
}
export function fullArchive(loaded: LoadedBackup) {
  const data = strToU8(JSON.stringify(loaded.backup));
  const total = data.length + Object.values(loaded.files).reduce((sum, file) => sum + file.length, 0);
  if (total > maxArchiveBytes) throw new BackupError('limit');
  const archive = zipSync({ ...loaded.files, 'data.json': data }, { level: 0 });
  if (archive.length > maxArchiveBytes) throw new BackupError('limit');
  return archive;
}
export async function loadBackup(bytes: Uint8Array, owner: string): Promise<LoadedBackup> {
  if (!bytes.length || bytes.length > maxArchiveBytes) throw new BackupError('limit');
  let files: Record<string, Uint8Array> = {};
  let value: unknown;
  try {
    if (bytes[0] === 80 && bytes[1] === 75) {
      let total = 0; const seen = new Set<string>();
      files = unzipSync(bytes, { filter(file) {
        if (seen.has(file.name) || seen.size >= 501 || !/^(?:data\.json|files\/(?:wardrobe-private|brand-private|outfit-renders-private)\/[a-z0-9/-]+\.(?:jpg|jpeg|png|webp))$/.test(file.name) || file.originalSize < 1 || file.originalSize > (file.name === 'data.json' ? maxDataBytes : maxFileBytes) || ![0, 8].includes(file.compression)) throw new BackupError('invalid');
        total += file.originalSize; seen.add(file.name);
        if (total > maxArchiveBytes) throw new BackupError('limit');
        return true;
      } });
      if (!files['data.json']) throw new BackupError('invalid');
      value = JSON.parse(strFromU8(files['data.json']));
    } else {
      if (bytes.length > maxDataBytes) throw new BackupError('limit');
      value = JSON.parse(strFromU8(bytes));
    }
  } catch (error) { if (error instanceof BackupError) throw error; throw new BackupError('invalid'); }
  const backup = validateBackup(value, owner);
  if (!files['data.json'] && backup.kind !== 'data') throw new BackupError('invalid');
  if (Object.keys(files).filter(name => name !== 'data.json').length !== backup.files.length) throw new BackupError('invalid');
  for (const file of backup.files) {
    const content = files[file.file];
    if (!content || content.length !== file.size || await sha256(content) !== file.sha256 || rasterKind(new Uint8Array(content).buffer) !== file.mime.replace('image/', '')) throw new BackupError('invalid');
  }
  delete files['data.json'];
  return { backup, files };
}

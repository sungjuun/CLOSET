import type { Tables } from '@/types/database.generated';

export type PhotoRecord = Tables<'item_images'>;
export type PrivatePhoto = PhotoRecord & { signedUrl: string | null };
export type PreparedImage = { bytes: ArrayBuffer; mime: 'image/jpeg' | 'image/png' | 'image/webp'; width: number; height: number };
export const photoLimit = 5;
export const photoByteLimit = 5 * 1024 * 1024;
export const sourceByteLimit = 30 * 1024 * 1024;
export const pixelLimit = 36_000_000;
export const signedUrlSeconds = 60;

export class PhotoError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function photoErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'permission_denied': return '카메라 권한이 필요합니다. 기기 설정에서 허용하거나 사진첩에서 선택해 주세요.';
    case 'unsupported': return '이 기기에서 읽을 수 없는 사진입니다. JPEG, PNG 또는 WebP 파일로 다시 선택해 주세요.';
    case 'source_large': return '원본은 30MiB 이하, 3,600만 화소 이하의 사진을 선택해 주세요.';
    case 'output_large': return '변환 후에도 사진이 5MiB를 초과합니다. 더 작은 사진을 선택해 주세요.';
    case 'P0001': case 'limit': case '23505': return '사진은 최대 5장까지 등록할 수 있습니다. 미완료 항목도 확인해 주세요.';
    case 'P0002': return '업로드된 파일을 찾지 못했습니다. 다시 시도하거나 미완료 항목을 정리해 주세요.';
    case '42501': case 'session_changed': return '접근 권한이나 로그인 상태가 변경됐습니다. 다시 로그인한 뒤 확인해 주세요.';
    case '23514': return '사진 또는 의류 상태를 확인해 주세요. 보관·삭제한 옷에는 새 사진을 추가할 수 없습니다.';
    case 'different_file': return '같은 사진 작업의 파일이 다릅니다. 기존 항목을 확인해 주세요.';
    default: return '사진 작업을 완료하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.';
  }
}

export function rasterKind(bytes: ArrayBuffer): 'jpeg' | 'png' | 'webp' | 'heif' | null {
  const data = new Uint8Array(bytes);
  const text = (start: number, length: number) => String.fromCharCode(...data.slice(start, start + length));
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return 'jpeg';
  if (data.length >= 8 && [137,80,78,71,13,10,26,10].every((value,index) => data[index] === value)) return 'png';
  if (data.length >= 20 && text(0,4) === 'RIFF' && text(8,4) === 'WEBP') return 'webp';
  if (data.length >= 20 && text(4,4) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(text(8,56))) return 'heif';
  return null;
}
export function validateSource(bytes: ArrayBuffer, width: number, height: number) {
  if (bytes.byteLength > sourceByteLimit || width * height > pixelLimit) throw new PhotoError('source_large');
  if (!bytes.byteLength || !rasterKind(bytes)) throw new PhotoError('unsupported');
}
export function validatePrepared(image: PreparedImage) {
  if (image.bytes.byteLength > photoByteLimit) throw new PhotoError('output_large');
  if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0 || image.width > 2048 || image.height > 2048 || rasterKind(image.bytes) !== image.mime.replace('image/','')) throw new PhotoError('unsupported');
}
export function primaryPhoto(photos: readonly PrivatePhoto[], itemId: string) {
  const ready = photos.filter((photo) => photo.item_id === itemId && photo.upload_status === 'ready');
  return ready.find((photo) => photo.is_primary) ?? ready[0] ?? null;
}

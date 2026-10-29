import type { ImagePickerAsset } from 'expo-image-picker';
import { centerSquareCrop, PhotoError, pixelLimit, sourceByteLimit, validatePrepared, validateSource, type PreparedImage } from './model';

// Browser adapter. Re-encoding strips EXIF and preserves aspect ratio/transparency.
export async function preparePhoto(asset: ImagePickerAsset, options: { square?: boolean } = {}): Promise<PreparedImage> {
  const file = asset.file;
  if (!file) throw new PhotoError('unsupported');
  if (file.size > sourceByteLimit) throw new PhotoError('source_large');
  validateSource(await file.arrayBuffer(),asset.width,asset.height);
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file,{ imageOrientation: 'from-image' }); }
  catch { throw new PhotoError('unsupported'); }
  try {
    if (bitmap.width * bitmap.height > pixelLimit) throw new PhotoError('source_large');
    const crop = options.square ? centerSquareCrop(bitmap.width,bitmap.height) : { originX: 0, originY: 0, width: bitmap.width, height: bitmap.height };
    const scale = Math.min(1,2048 / Math.max(crop.width,crop.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(crop.width * scale));
    canvas.height = Math.max(1,Math.round(crop.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new PhotoError('unsupported');
    context.drawImage(bitmap,crop.originX,crop.originY,crop.width,crop.height,0,0,canvas.width,canvas.height);
    const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new PhotoError('unsupported')),'image/webp',0.82));
    let output = blob;
    if (blob.type !== 'image/webp') {
      context.globalCompositeOperation = 'destination-over';
      context.fillStyle = '#FFFFFF'; context.fillRect(0,0,canvas.width,canvas.height);
      output = await new Promise<Blob>((resolve,reject) => canvas.toBlob((result) => result?.type === 'image/jpeg' ? resolve(result) : reject(new PhotoError('unsupported')),'image/jpeg',0.82));
    }
    const prepared: PreparedImage = { bytes: await output.arrayBuffer(), mime: output.type === 'image/webp' ? 'image/webp' : 'image/jpeg', width: canvas.width, height: canvas.height };
    validatePrepared(prepared);
    return prepared;
  } finally { bitmap.close(); }
}
export function releaseSource(asset: ImagePickerAsset) {
  if (asset.uri.startsWith('blob:')) URL.revokeObjectURL(asset.uri);
}

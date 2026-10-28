import type { ImagePickerAsset } from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { PhotoError, sourceByteLimit, validatePrepared, validateSource, type PreparedImage } from './model';

export async function preparePhoto(asset: ImagePickerAsset): Promise<PreparedImage> {
  if (!/^(file|content):\/\//.test(asset.uri)) throw new PhotoError('unsupported');
  const original = new File(asset.uri);
  if (original.size > sourceByteLimit) throw new PhotoError('source_large');
  validateSource(await original.arrayBuffer(),asset.width,asset.height);
  const context = ImageManipulator.manipulate(asset.uri,{ maxWidth: 2048, maxHeight: 2048 });
  const size = Math.max(asset.width,asset.height);
  if (size > 2048) context.resize(asset.width >= asset.height ? { width: 2048 } : { height: 2048 });
  let output: File | null = null;
  try {
    const rendered = await context.renderAsync();
    try {
      const saved = await rendered.saveAsync({ format: SaveFormat.WEBP, compress: 0.82 });
      output = new File(saved.uri);
      const prepared: PreparedImage = { bytes: await output.arrayBuffer(), mime: 'image/webp', width: saved.width, height: saved.height };
      validatePrepared(prepared);
      return prepared;
    } finally { rendered.release(); }
  } catch (error) {
    if (error instanceof PhotoError) throw error;
    throw new PhotoError('unsupported');
  } finally {
    context.release();
    if (output?.uri.startsWith(Paths.cache.uri) && output.uri !== asset.uri && output.exists) output.delete();
  }
}
export function releaseSource(_asset: ImagePickerAsset) { /* Keep the user's original source untouched. */ }

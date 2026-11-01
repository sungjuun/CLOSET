import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { BackupError, maxArchiveBytes } from './model';

export async function pickBackupFile(): Promise<Uint8Array | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'application/zip', 'application/x-zip-compressed'], copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const file = new File(asset.uri);
  // DocumentPicker returns a cache copy, never the user's source document.
  try {
    if ((asset.size ?? file.size) > maxArchiveBytes) throw new BackupError('limit');
    return await file.bytes();
  } finally { if (file.exists && file.uri.startsWith(Paths.cache.uri)) file.delete(); }
}
export async function saveBackupFile(bytes: Uint8Array, name: string, mime: string) {
  if (!await Sharing.isAvailableAsync()) throw new BackupError('sharing');
  const file = new File(Paths.cache, `${Date.now()}-${name}`);
  try {
    file.create(); file.write(bytes);
    await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: 'CLOSET 백업 저장', UTI: mime === 'application/zip' ? 'public.zip-archive' : 'public.json' });
  } finally { if (file.exists) file.delete(); }
}

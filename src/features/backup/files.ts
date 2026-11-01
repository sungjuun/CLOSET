import { BackupError, maxArchiveBytes } from './model';

export async function pickBackupFile(): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,.zip,application/json,application/zip';
    input.oncancel = () => resolve(null);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      if (file.size > maxArchiveBytes) { reject(new BackupError('limit')); return; }
      void file.arrayBuffer().then(bytes => resolve(new Uint8Array(bytes)), reject);
    };
    input.click();
  });
}
export async function saveBackupFile(bytes: Uint8Array, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: mime }));
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

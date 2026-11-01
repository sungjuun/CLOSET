import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { backupDate, csv, fullArchive, loadBackup, tableNames, validateBackup, withoutMedia, type Backup } from '../src/features/backup/model';
import { sha256 } from '../src/features/backup/hash';
import { makePng } from './helpers/png';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
function sample(): Backup {
  return { format: 'closet-backup', version: 1, kind: 'data', createdAt: '2026-11-02T00:00:00.000Z', owner, profile: { id: owner, display_name: '내 옷장' }, tables: Object.fromEntries(tableNames.map(table => [table, []])) as unknown as Backup['tables'], files: [] };
}
describe('member backup files', () => {
  it('round-trips Korean JSON with the original owner and rejects a different owner', async () => {
    expect(backupDate('2026-11-01T23:00:00.000Z')).toBe('2026-11-02');
    const value = sample();
    value.tables.wardrobe_items.push({ id: other, user_id: owner, name: '가을 옷' });
    expect((await loadBackup(strToU8(JSON.stringify(value)), owner)).backup).toEqual(value);
    await expect(loadBackup(strToU8(JSON.stringify(value)), other)).rejects.toMatchObject({ code: 'owner' });
  });
  it('rejects foreign rows, unknown versions, tables and secret fields in the envelope', () => {
    const value = sample();
    value.tables.outfits.push({ user_id: other });
    expect(() => validateBackup(value, owner)).toThrow();
    expect(() => validateBackup({ ...sample(), version: 2 }, owner)).toThrow();
    expect(() => validateBackup({ ...sample(), access_token: 'secret' }, owner)).toThrow();
    expect(() => validateBackup({ ...sample(), tables: { ...sample().tables, users: [] } }, owner)).toThrow();
  });
  it('restores intact photo bytes and detects a missing or modified ZIP entry', async () => {
    const backup = sample(); backup.kind = 'full';
    const bytes = new Uint8Array(makePng(0));
    const path = `${owner}/items/${other}/${other}.png`;
    backup.tables.item_images.push({ user_id: owner, storage_path: path });
    backup.files.push({ bucket: 'wardrobe-private', path, file: `files/wardrobe-private/${path}`, mime: 'image/png', size: bytes.length, sha256: await sha256(bytes) });
    const loaded = { backup, files: { [backup.files[0]!.file]: bytes } };
    expect((await loadBackup(fullArchive(loaded), owner)).files).toEqual(loaded.files);
    await expect(loadBackup(zipSync({ 'data.json': strToU8(JSON.stringify(backup)) }), owner)).rejects.toMatchObject({ code: 'invalid' });
    await expect(loadBackup(fullArchive({ backup, files: { [backup.files[0]!.file]: new Uint8Array(makePng(1)) } }), owner)).rejects.toMatchObject({ code: 'invalid' });
  });
  it('rejects path traversal, unexpected files, full JSON without ZIP, and huge declared entries before extraction', async () => {
    for (const name of ['../data.json', '/data.json', 'files/../../oops.png', 'data.json.exe']) {
      await expect(loadBackup(zipSync({ [name]: strToU8('{}') }), owner)).rejects.toThrow();
    }
    const full = { ...sample(), kind: 'full' };
    await expect(loadBackup(strToU8(JSON.stringify(full)), owner)).rejects.toThrow();
    // The central-directory uncompressed size is checked before allocating/decompressing.
    const zipped = zipSync({ 'data.json': strToU8(JSON.stringify(sample())) });
    const mutated = new Uint8Array(zipped);
    for (let i = 0; i < mutated.length - 24; i++) if (mutated[i] === 80 && mutated[i + 1] === 75 && mutated[i + 2] === 1 && mutated[i + 3] === 2) new DataView(mutated.buffer).setUint32(i + 24, 0x7fffffff, true);
    await expect(loadBackup(mutated, owner)).rejects.toThrow();
  });
  it('strips photo references for data-only backup and neutralizes CSV formulas and embedded quotes/newlines', () => {
    const backup = sample(); backup.kind = 'full';
    backup.tables.brands.push({ user_id: owner, image_path: 'private' });
    backup.tables.outfit_presentations.push({ user_id: owner, render_id: other });
    const stripped = withoutMedia(backup);
    expect(stripped.tables.brands[0]!.image_path).toBeNull();
    expect(stripped.tables.outfit_presentations[0]!.render_id).toBeNull();
    expect(validateBackup(stripped, owner).kind).toBe('data');
    const text = csv([{ formula: ' =HYPERLINK("evil")', memo: '첫 줄\n"둘째 줄"', zero: 0, absent: null }]);
    expect(text).toContain('"\' =HYPERLINK(""evil"")"');
    expect(text).toContain('"첫 줄\n""둘째 줄"""');
    expect(text).toContain('"0"');
    expect(text.startsWith('\uFEFF')).toBe(true);
  });
});

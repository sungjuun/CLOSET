import { describe, expect, it } from 'vitest';
import { PhotoError, photoByteLimit, photoErrorMessage, primaryPhoto, rasterKind, validatePrepared, validateSource, type PrivatePhoto } from '../src/features/wardrobe/photos/model';
import { makePng } from './helpers/png';

describe('photo input and presentation boundaries', () => {
  it('recognizes actual raster signatures and rejects an SVG disguised as JPEG', () => {
    expect(rasterKind(makePng())).toBe('png');
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>').buffer;
    expect(() => validateSource(svg,100,100)).toThrow(PhotoError);
    expect(() => validatePrepared({ bytes: makePng(), mime: 'image/jpeg', width: 96, height: 64 })).toThrow();
  });
  it('bounds original pixels and final bytes/dimensions', () => {
    expect(() => validateSource(makePng(),9000,9000)).toThrow();
    expect(() => validatePrepared({ bytes: new ArrayBuffer(photoByteLimit + 1), mime: 'image/png', width: 96, height: 64 })).toThrow();
    expect(() => validatePrepared({ bytes: makePng(), mime: 'image/png', width: 2049, height: 64 })).toThrow();
    expect(() => validatePrepared({ bytes: makePng(), mime: 'image/png', width: NaN, height: 64 })).toThrow();
    expect(() => validatePrepared({ bytes: makePng(), mime: 'image/png', width: 96, height: 64 })).not.toThrow();
  });
  it('shows only ready photos and prefers the explicit primary for the requested item', () => {
    const photos = [
      { id: 'pending', item_id: 'a', upload_status: 'pending', is_primary: false },
      { id: 'first', item_id: 'a', upload_status: 'ready', is_primary: false },
      { id: 'primary', item_id: 'a', upload_status: 'ready', is_primary: true },
      { id: 'other', item_id: 'b', upload_status: 'ready', is_primary: true },
    ] as PrivatePhoto[];
    expect(primaryPhoto(photos,'a')?.id).toBe('primary');
    expect(primaryPhoto(photos.filter((photo) => photo.id !== 'primary'),'a')?.id).toBe('first');
    expect(primaryPhoto(photos,'missing')).toBeNull();
  });
  it('keeps server details and signed URLs out of error text', () => {
    expect(photoErrorMessage({ message: 'https://private.example?token=secret' })).not.toContain('secret');
    expect(photoErrorMessage({ code: 'P0001' })).toContain('5장');
    expect(photoErrorMessage({ code: 'permission_denied' })).toContain('권한');
  });
});

import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';

export function makePng(variant = 0, width = 96, height = 64): ArrayBuffer {
  function chunk(name: string, data: Buffer) {
    const type = Buffer.from(name);
    const body = Buffer.concat([type,data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size,body,checksum]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width,0); header.writeUInt32BE(height,4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (width * 4 + 1) + 1 + x * 4;
    rows[offset] = variant ? 200 : 35; rows[offset + 1] = 80 + Math.floor(y * 100 / height);
    rows[offset + 2] = variant ? 60 : 170 + Math.floor(x * 50 / width); rows[offset + 3] = 255;
  }
  return Uint8Array.from(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])).buffer;
}

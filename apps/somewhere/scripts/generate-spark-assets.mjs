/* eslint-disable no-bitwise -- CRC32 checksums and PNG chunk encoding are inherently bit-level. */
// Generates public/spark.png — a small warm-yellow diamond "spark" on a transparent
// background. Uses only Node built-ins (no external deps), unlike the fast-png based
// generators in this folder, so it runs with zero install: `node scripts/generate-spark-assets.mjs`.
import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';

const SIZE = 16;
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

// --- build RGBA scanlines (one filter byte per row, filter type 0 = None) ---
const center = (SIZE - 1) / 2;
const radius = SIZE / 2 - 1;
const rowStride = SIZE * 4 + 1;
const raw = Buffer.alloc(SIZE * rowStride);

for (let y = 0; y < SIZE; y++) {
  const rowStart = y * rowStride;

  raw[rowStart] = 0; // filter: None

  for (let x = 0; x < SIZE; x++) {
    const inside = Math.abs(x - center) + Math.abs(y - center) <= radius;
    const i = rowStart + 1 + x * 4;

    raw[i] = inside ? 255 : 0; // R
    raw[i + 1] = inside ? 220 : 0; // G
    raw[i + 2] = inside ? 40 : 0; // B
    raw[i + 3] = inside ? 255 : 0; // A (0 = fully transparent)
  }
}

// --- minimal PNG writer ---
const crcTable = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n++) {
    let c = n;

    for (let k = 0; k < 8; k++) {
      c = (c & 1) === 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
    }

    table[n] = c >>> 0;
  }

  return table;
})();

function crc32(buffer) {
  let crc = 0xff_ff_ff_ff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);

  length.writeUInt32BE(data.length, 0);

  const crc = Buffer.alloc(4);

  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);

ihdr.writeUInt32BE(SIZE, 0); // width
ihdr.writeUInt32BE(SIZE, 4); // height
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
ihdr[10] = 0; // compression method
ihdr[11] = 0; // filter method
ihdr[12] = 0; // interlace method

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(join(publicDir, 'spark.png'), png);

// eslint-disable-next-line no-console -- CLI script feedback
console.log(`Wrote ${join(publicDir, 'spark.png')} (${png.length} bytes)`);

// Generate the pixel-art PNG asset for the keyboard focus ring overlay.
// Usage: node scripts/generate-focus-ring-assets.mjs
//
// A hollow ring, 1 art pixel wide, drawn on the same grid of "chunky 4px
// blocks" as the other UI assets (1 art pixel = a 4x4 px block). The corner
// art-pixels are clipped like the button border, so the ring reads slightly
// rounder than the square text-input box; the center is fully transparent so
// the ring only outlines the focused component. Rendered as a NineSliceSprite
// with 4px (1 art-pixel) margins, so the ring stays a crisp 1 art-pixel at any
// size.
//
// Idempotent: re-running overwrites the PNG with identical bytes.
// The bright blue (PICO-8 #29ADFF) pops against the navy/grey palette of the
// other UI assets (sampled from public/banner*.png).

import {encode} from 'fast-png';
import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const BLOCK = 4; // 1 art pixel = 4x4 px (matches the other UI assets)
const GRID = 3; // 1-art-pixel ring + 1 stretchable transparent cell + 1-art-pixel ring
const CHANNELS = 4; // RGBA

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

const palette = {
  transparent: [0, 0, 0, 0],
  blue: [41, 173, 255, 255],
};

// A hollow 1-art-pixel ring with clipped (slightly rounded) corners.
function buildRing() {
  const cells = [];

  for (let row = 0; row < GRID; row++) {
    const cols = [];

    for (let col = 0; col < GRID; col++) {
      const isEdgeRow = row === 0 || row === GRID - 1;
      const isEdgeCol = col === 0 || col === GRID - 1;
      let color;

      if (isEdgeRow && isEdgeCol) {
        color = palette.transparent; // clipped (rounded) corner
      } else if (isEdgeRow || isEdgeCol) {
        color = palette.blue;
      } else {
        color = palette.transparent; // hollow center
      }

      cols.push(color);
    }

    cells.push(cols);
  }

  return cells;
}

// Render a grid of [r,g,b,a] cells into an RGBA Uint8Array, each cell painted as
// a BLOCK x BLOCK px block (the "chunky 4px blocks" look).
function renderGrid(cells) {
  const rows = cells.length;
  const columns = cells[0].length;
  const width = columns * BLOCK;
  const height = rows * BLOCK;
  const data = new Uint8Array(width * height * CHANNELS);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const [r, g, b, a] = cells[row][col];

      for (let dy = 0; dy < BLOCK; dy++) {
        for (let dx = 0; dx < BLOCK; dx++) {
          const offset = ((row * BLOCK + dy) * width + (col * BLOCK + dx)) * CHANNELS;

          data[offset] = r;
          data[offset + 1] = g;
          data[offset + 2] = b;
          data[offset + 3] = a;
        }
      }
    }
  }

  return {width, height, data};
}

function main() {
  const {width, height, data} = renderGrid(buildRing());
  const png = encode({width, height, data, channels: CHANNELS});
  const outPath = join(publicDir, 'focus-ring.png');

  writeFileSync(outPath, png);
  console.log(`Wrote ${outPath} (${width}x${height})`);
}

main();

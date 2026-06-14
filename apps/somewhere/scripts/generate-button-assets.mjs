// Generate pixel-art PNG assets for the Button UI component.
// Usage: node scripts/generate-button-assets.mjs
//
// Like the TextInput box but as an extruded 3D "slab", drawn on the same grid of
// "chunky 4px blocks" as the toggle (1 art pixel = a 4x4 px block): a 1-art-pixel
// border with slightly rounded corners (the corner art-pixels are clipped), a
// 1-art-pixel top highlight, and a darker side band below the face so the button
// looks raised. The active variant (shown while the pointer is held down) drops the face (a transparent art-pixel gap
// on top) and removes the band so it reads as pushed toward the surface.
// Rendered as a NineSliceSprite so the flat center stretches while the border,
// rounded corners and side band stay a crisp 1 art-pixel.
//
// Idempotent — re-running overwrites the 4 PNGs with identical bytes.
// Palette matches scripts/generate-toggle-assets.mjs (sampled from public/banner*.png),
// plus a lighter raised face and a darker side band derived from it.

import {encode} from 'fast-png';
import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const BLOCK = 4; // 1 art pixel = 4x4 px (matches the toggle)
const GRID_W = 3; // 1-art-pixel border + 1 stretchable cell + 1-art-pixel border
const GRID_H = 5; // border, highlight, face, band, border (art pixels)
const CHANNELS = 4; // RGBA

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

const palette = {
  transparent: [0, 0, 0, 0],

  border: [194, 195, 199, 255],
  borderBright: [223, 224, 228, 255],
  borderMuted: [120, 122, 130, 255],

  // Raised face: lighter than the navy panel (29,43,83) it sits on, so the
  // button reads as protruding rather than blending into the surface.
  face: [50, 70, 128, 255],
  faceHover: [68, 92, 160, 255],
  faceActive: [40, 58, 110, 255],
  faceMuted: [58, 64, 82, 255],

  // Top inner highlight catching light on the raised top edge.
  highlight: [86, 112, 180, 255],
  highlightHover: [104, 134, 205, 255],

  // Darker side band = the shadowed lower side of the protruding slab.
  side: [18, 27, 52, 255],
  sideHover: [24, 36, 72, 255],
  sideMuted: [32, 36, 48, 255],
};

// Build the GRID_W x GRID_H art-pixel grid for one slab variant. `topGap`
// transparent rows sit above the slab (the pressed face is pushed down); the
// slab spans rows [topGap..GRID_H-1] with a 1-art-pixel border whose corner
// art-pixels are clipped (slightly rounded), `bandRows` darker side-band rows
// above the bottom border, and an optional 1-art-pixel top highlight.
function buildSlab({face, band, border, highlight, topGap, bandRows}) {
  const top = topGap;
  const bottom = GRID_H - 1;
  const cells = [];

  for (let row = 0; row < GRID_H; row++) {
    const cols = [];

    for (let col = 0; col < GRID_W; col++) {
      const isEdgeRow = row === top || row === bottom;
      const isEdgeCol = col === 0 || col === GRID_W - 1;
      let color;

      if (row < top || (isEdgeRow && isEdgeCol)) {
        color = palette.transparent; // gap above the slab, or a clipped (rounded) corner
      } else if (isEdgeRow || isEdgeCol) {
        color = border;
      } else if (row >= bottom - bandRows) {
        color = band;
      } else if (highlight !== undefined && row === top + 1) {
        color = highlight;
      } else {
        color = face;
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

const variants = {
  'button-normal': buildSlab({
    face: palette.face,
    band: palette.side,
    border: palette.border,
    highlight: palette.highlight,
    topGap: 0,
    bandRows: 1,
  }),
  'button-hovered': buildSlab({
    face: palette.faceHover,
    band: palette.sideHover,
    border: palette.borderBright,
    highlight: palette.highlightHover,
    topGap: 0,
    bandRows: 1,
  }),
  'button-active': buildSlab({
    face: palette.faceActive,
    band: palette.side,
    border: palette.border,
    topGap: 1,
    bandRows: 0,
  }),
  'button-disabled': buildSlab({
    face: palette.faceMuted,
    band: palette.sideMuted,
    border: palette.borderMuted,
    topGap: 0,
    bandRows: 1,
  }),
};

function main() {
  for (const [name, cells] of Object.entries(variants)) {
    const {width, height, data} = renderGrid(cells);
    const png = encode({width, height, data, channels: CHANNELS});
    const outPath = join(publicDir, `${name}.png`);

    writeFileSync(outPath, png);
    console.log(`Wrote ${outPath} (${width}x${height})`);
  }
}

main();

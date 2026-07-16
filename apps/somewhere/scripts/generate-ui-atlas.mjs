// Generate the 1×-art-px UI atlas: public/ui.png + public/ui.json. One sheet
// replaces the standalone UI PNGs (button ×4, toggle ×6, text-input ×3,
// focus-ring, banner); nine-slice insets ship as per-frame `borders` in art px
// (pixi passes them straight to texture.defaultBorders) and toggle frames are
// plain sprites with none. The per-widget render code is ported from the
// archived $/scripts-2026-07-02/ generators at BLOCK = 1 — the runtime
// pixelScale now provides the chunky-block look the old ×4 bake hard-coded.
// The banner frame is blitted from the hand-made 1× source art in
// scripts/assets/banner.png (put there by scripts/migrate-assets-to-1x.mjs).
//
// Idempotent — re-running overwrites both files with identical bytes.
// Usage: node scripts/generate-ui-atlas.mjs

import {decode, encode} from 'fast-png';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const CHANNELS = 4; // RGBA
const GAP = 1; // transparent px between frames — insurance against sampling bleed

let publicDir = fileURLToPath(new URL('../public/', import.meta.url));
let assetsDir = fileURLToPath(new URL('./assets/', import.meta.url));

// Union of the archived generators' palettes (sampled from the banner art).
const palette = {
  transparent: [0, 0, 0, 0],

  navy: [29, 43, 83, 255],
  navyBright: [40, 60, 115, 255],
  navyMuted: [58, 64, 82, 255],

  border: [194, 195, 199, 255],
  borderBright: [223, 224, 228, 255],
  borderMuted: [120, 122, 130, 255],

  icon: [233, 234, 238, 255],
  iconMuted: [146, 148, 156, 255],

  face: [50, 70, 128, 255],
  faceHover: [68, 92, 160, 255],
  faceActive: [40, 58, 110, 255],
  faceMuted: [58, 64, 82, 255],

  highlight: [86, 112, 180, 255],
  highlightHover: [104, 134, 205, 255],

  side: [18, 27, 52, 255],
  sideHover: [24, 36, 72, 255],
  sideMuted: [32, 36, 48, 255],

  ringBlue: [41, 173, 255, 255],
};

// Button: a 3×5 extruded "slab" — border with clipped corners, top highlight,
// darker side band; the active variant drops the face by one px (topGap) and
// removes the band so it reads as pushed in.
const SLAB_W = 3;
const SLAB_H = 5;

function buildSlab({face, band, border, highlight, topGap, bandRows}) {
  let top = topGap;
  let bottom = SLAB_H - 1;
  let cells = [];

  for (let row = 0; row < SLAB_H; row++) {
    let cols = [];

    for (let col = 0; col < SLAB_W; col++) {
      let isEdgeRow = row === top || row === bottom;
      let isEdgeCol = col === 0 || col === SLAB_W - 1;
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

// Toggle: an 8×8 box — 1-px border ring, body fill, and for checked variants a
// centered 4×4 icon (rows/cols 2..5).
const TOGGLE_GRID = 8;

function buildToggle({border, body, icon}) {
  let cells = [];

  for (let row = 0; row < TOGGLE_GRID; row++) {
    let cols = [];

    for (let col = 0; col < TOGGLE_GRID; col++) {
      let isBorder = row === 0 || row === TOGGLE_GRID - 1 || col === 0 || col === TOGGLE_GRID - 1;
      let isIcon = icon !== undefined && row >= 2 && row <= 5 && col >= 2 && col <= 5;

      cols.push(
        isBorder ? border
        : isIcon ? icon
        : body,
      );
    }

    cells.push(cols);
  }

  return cells;
}

// Text input: a 3×3 box — 1-px border ring with square corners around a fill.
function buildBox({body, border}) {
  let cells = [];

  for (let row = 0; row < 3; row++) {
    let cols = [];

    for (let col = 0; col < 3; col++) {
      let isBorder = row === 0 || row === 2 || col === 0 || col === 2;

      cols.push(isBorder ? border : body);
    }

    cells.push(cols);
  }

  return cells;
}

// Focus ring: a hollow 3×3 1-px ring with clipped (slightly rounded) corners.
function buildRing() {
  let cells = [];

  for (let row = 0; row < 3; row++) {
    let cols = [];

    for (let col = 0; col < 3; col++) {
      let isEdgeRow = row === 0 || row === 2;
      let isEdgeCol = col === 0 || col === 2;

      if (isEdgeRow && isEdgeCol) {
        cols.push(palette.transparent); // clipped corner
      } else if (isEdgeRow || isEdgeCol) {
        cols.push(palette.ringBlue);
      } else {
        cols.push(palette.transparent); // hollow center
      }
    }

    cells.push(cols);
  }

  return cells;
}

// Render a cell grid at 1 art px per cell.
function renderCells(cells) {
  let height = cells.length;
  let width = cells[0].length;
  let data = new Uint8Array(width * height * CHANNELS);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      data.set(cells[row][col], (row * width + col) * CHANNELS);
    }
  }

  return {width, height, data};
}

function loadBanner() {
  let png = decode(readFileSync(join(assetsDir, 'banner.png')));

  if (png.depth !== 8 || png.channels !== 4) {
    throw new Error(
      `banner.png: expected 8-bit RGBA, got depth ${png.depth} with ${png.channels} channels!`,
    );
  }

  return {width: png.width, height: png.height, data: png.data};
}

const BUTTON_BORDERS = {left: 1, top: 2, right: 1, bottom: 2};
const BUTTON_ACTIVE_BORDERS = {left: 1, top: 2, right: 1, bottom: 1};
const BOX_BORDERS = {left: 1, top: 1, right: 1, bottom: 1};
const BANNER_BORDERS = {left: 3, top: 1, right: 3, bottom: 3};

let frames = [
  {name: 'banner', image: loadBanner(), borders: BANNER_BORDERS},
  {
    name: 'button-normal',
    image: renderCells(
      buildSlab({
        face: palette.face,
        band: palette.side,
        border: palette.border,
        highlight: palette.highlight,
        topGap: 0,
        bandRows: 1,
      }),
    ),
    borders: BUTTON_BORDERS,
  },
  {
    name: 'button-hovered',
    image: renderCells(
      buildSlab({
        face: palette.faceHover,
        band: palette.sideHover,
        border: palette.borderBright,
        highlight: palette.highlightHover,
        topGap: 0,
        bandRows: 1,
      }),
    ),
    borders: BUTTON_BORDERS,
  },
  {
    name: 'button-active',
    image: renderCells(
      buildSlab({
        face: palette.faceActive,
        band: palette.side,
        border: palette.border,
        topGap: 1,
        bandRows: 0,
      }),
    ),
    borders: BUTTON_ACTIVE_BORDERS,
  },
  {
    name: 'button-disabled',
    image: renderCells(
      buildSlab({
        face: palette.faceMuted,
        band: palette.sideMuted,
        border: palette.borderMuted,
        topGap: 0,
        bandRows: 1,
      }),
    ),
    borders: BUTTON_BORDERS,
  },
  {
    name: 'toggle-unchecked',
    image: renderCells(buildToggle({border: palette.border, body: palette.navy})),
  },
  {
    name: 'toggle-checked',
    image: renderCells(
      buildToggle({border: palette.border, body: palette.navy, icon: palette.icon}),
    ),
  },
  {
    name: 'toggle-hovered',
    image: renderCells(buildToggle({border: palette.borderBright, body: palette.navyBright})),
  },
  {
    name: 'toggle-hovered-checked',
    image: renderCells(
      buildToggle({border: palette.borderBright, body: palette.navyBright, icon: palette.icon}),
    ),
  },
  {
    name: 'toggle-disabled',
    image: renderCells(buildToggle({border: palette.borderMuted, body: palette.navyMuted})),
  },
  {
    name: 'toggle-disabled-checked',
    image: renderCells(
      buildToggle({border: palette.borderMuted, body: palette.navyMuted, icon: palette.iconMuted}),
    ),
  },
  {
    name: 'text-input-normal',
    image: renderCells(buildBox({body: palette.navy, border: palette.border})),
    borders: BOX_BORDERS,
  },
  {
    name: 'text-input-hovered',
    image: renderCells(buildBox({body: palette.navyBright, border: palette.borderBright})),
    borders: BOX_BORDERS,
  },
  {
    name: 'text-input-disabled',
    image: renderCells(buildBox({body: palette.navyMuted, border: palette.borderMuted})),
    borders: BOX_BORDERS,
  },
  {name: 'focus-ring', image: renderCells(buildRing()), borders: BOX_BORDERS},
];

// Single-column shelf packing: trivially correct, and at art-px sizes the
// whole sheet stays tiny (146 × ~120 px).
let sheetWidth = Math.max(...frames.map(({image}) => image.width));
let sheetHeight = frames.reduce((sum, {image}) => sum + image.height + GAP, -GAP);
let sheet = new Uint8Array(sheetWidth * sheetHeight * CHANNELS);
let framesJson = {};
let y = 0;

for (let {name, image, borders} of frames) {
  for (let row = 0; row < image.height; row++) {
    sheet.set(
      image.data.subarray(row * image.width * CHANNELS, (row + 1) * image.width * CHANNELS),
      (y + row) * sheetWidth * CHANNELS,
    );
  }

  framesJson[name] = {frame: {x: 0, y, w: image.width, h: image.height}, ...(borders && {borders})};
  y += image.height + GAP;
}

writeFileSync(
  join(publicDir, 'ui.png'),
  encode({width: sheetWidth, height: sheetHeight, data: sheet, channels: CHANNELS}),
);
writeFileSync(
  join(publicDir, 'ui.json'),
  `${JSON.stringify({frames: framesJson, meta: {image: 'ui.png'}}, null, 2)}\n`,
);
// eslint-disable-next-line no-console -- one-shot generator script feedback
console.log(
  `wrote public/ui.png (${sheetWidth}x${sheetHeight}) and public/ui.json (${frames.length} frames)`,
);

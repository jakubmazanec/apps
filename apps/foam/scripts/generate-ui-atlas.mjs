// Generate Foam's UI atlas: public/ui.png + public/ui.json. Every frame is drawn here pixel by
// pixel from the palette in source/game/core/palette.ts; no image file is read. The JSON is
// Tellurion's spriteset format, with nine-slice borders in art pixels.
//
// Idempotent: running it again writes the same bytes. A test compares drawUiAtlas() with the two
// files, so the committed art cannot differ from what this script draws.
// Usage: node scripts/generate-ui-atlas.mjs

import {decode, encode} from 'fast-png';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

import {palette as colors} from '../source/game/core/palette.ts';

const CHANNELS = 4; // RGBA
const GAP = 1; // transparent pixels between frames, against sampling bleed
const BORDERS = {left: 2, top: 2, right: 2, bottom: 2};
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

function toRgba(value) {
  return [Math.floor(value / 0x10000) % 256, Math.floor(value / 0x100) % 256, value % 256, 255];
}

const palette = {
  transparent: [0, 0, 0, 0],
  ...Object.fromEntries(Object.entries(colors).map(([name, value]) => [name, toRgba(value)])),
};

// A box of the given size: a one pixel border around an inside. All corners are square. An
// optional square of `mark` pixels sits in the middle.
function buildBox({width, height, border, inside, mark, markSize = 0}) {
  let cells = [];

  for (let row = 0; row < height; row++) {
    let cols = [];

    for (let col = 0; col < width; col++) {
      let isBorder = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      let markLeft = (width - markSize) / 2;
      let markTop = (height - markSize) / 2;
      let isMark =
        mark !== undefined &&
        row >= markTop &&
        row < markTop + markSize &&
        col >= markLeft &&
        col < markLeft + markSize;

      cols.push(
        isBorder ? border
        : isMark ? mark
        : inside,
      );
    }

    cells.push(cols);
  }

  return cells;
}

function solid(width, height, color) {
  return {cells: buildBox({width, height, border: color, inside: color})};
}

// A 5 x 5 nine-slice frame. Each edge slice is the one pixel border and one pixel of the inside,
// so the stretched middle pixel meets its own colour: the GPU rounds a texture coordinate to a
// fraction of a pixel, and the far end of a long stretch can take the pixel next to it.
function nineSlice(border, inside) {
  return {borders: BORDERS, cells: buildBox({width: 5, height: 5, border, inside})};
}

function toggle(border, mark) {
  return {
    cells: buildBox({
      width: 8,
      height: 8,
      border,
      inside: palette.black,
      mark,
      markSize: mark === undefined ? 0 : 4,
    }),
  };
}

function track(border) {
  return {cells: buildBox({width: 64, height: 8, border, inside: palette.black})};
}

// In the order of the sheet.
const frames = [
  ['window', nineSlice(palette.line, palette.black)],
  ['button-normal', nineSlice(palette.line, palette.black)],
  ['button-hovered', nineSlice(palette.dim, palette.ground)],
  ['button-active', nineSlice(palette.white, palette.line)],
  ['button-disabled', nineSlice(palette.shade, palette.black)],
  ['text-input-normal', nineSlice(palette.line, palette.black)],
  ['text-input-hovered', nineSlice(palette.dim, palette.black)],
  ['text-input-disabled', nineSlice(palette.shade, palette.black)],
  ['toggle-unchecked', toggle(palette.dim)],
  ['toggle-checked', toggle(palette.dim, palette.white)],
  ['toggle-hovered', toggle(palette.white)],
  ['toggle-hovered-checked', toggle(palette.white, palette.white)],
  ['toggle-disabled', toggle(palette.shade)],
  ['toggle-disabled-checked', toggle(palette.shade, palette.line)],
  ['slider-track', track(palette.line)],
  ['slider-track-hovered', track(palette.dim)],
  ['slider-track-disabled', track(palette.shade)],
  ['slider-fill', solid(4, 4, palette.white)],
  ['focus-ring', nineSlice(palette.rose, palette.transparent)],
  ['rule', solid(1, 1, palette.line)],
  ['cursor', solid(5, 9, palette.rose)],
];

export function drawUiAtlas() {
  let sheetHeight = 0;
  let placed = [];

  for (let [name, frame] of frames) {
    let height = frame.cells.length;
    let width = frame.cells[0].length;

    placed.push({name, frame, y: sheetHeight, width, height});
    sheetHeight += height + GAP;
  }

  sheetHeight -= GAP;

  let sheetWidth = Math.max(...placed.map((frame) => frame.width)); // the widest frame
  let data = new Uint8Array(sheetWidth * sheetHeight * CHANNELS); // transparent black
  let json = {image: 'ui.png', frames: {}};

  for (let {name, frame, y, width, height} of placed) {
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        data.set(frame.cells[row][col], ((y + row) * sheetWidth + col) * CHANNELS);
      }
    }

    json.frames[name] = {
      x: 0,
      y,
      width,
      height,
      ...(frame.borders === undefined ? {} : {borders: frame.borders}),
    };
  }

  return {
    png: encode({width: sheetWidth, height: sheetHeight, data, depth: 8, channels: CHANNELS}),
    json: `${JSON.stringify(json, null, 2)}\n`,
  };
}

if (process.argv[1] === import.meta.filename) {
  let {png, json} = drawUiAtlas();
  let image = decode(png);

  await writeFile(`${publicDir}ui.png`, png);
  await writeFile(`${publicDir}ui.json`, json);

  // eslint-disable-next-line no-console -- one-shot generator script feedback
  console.log(
    `wrote public/ui.png (${image.width}x${image.height}) and public/ui.json (${frames.length} frames)`,
  );
}

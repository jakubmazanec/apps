// Pure helpers for the one-shot ×4 → 1× asset migration (runtime pixel scale,
// T1.5). No file I/O here: everything takes and returns plain data so the
// guards are unit-testable (tests/assetMigration.test.ts). The CLI wrapper is
// scripts/migrate-assets-to-1x.mjs.

/**
 * @typedef {object} RawImage
 * @property {number} width
 * @property {number} height
 * @property {number} channels
 * @property {Uint8Array} data
 */

/**
 * Every baked PNG must be exact uniform block×block squares across all
 * channels, alpha included — the proof that the ÷block downscale is lossless.
 *
 * @param {RawImage} image
 * @param {number} block
 * @param {string} label
 */
export function assertUniformBlocks({width, height, channels, data}, block, label) {
  if (width % block !== 0 || height % block !== 0) {
    throw new Error(`${label}: ${width}x${height} is not a multiple of ${block}!`);
  }

  for (let blockY = 0; blockY < height; blockY += block) {
    for (let blockX = 0; blockX < width; blockX += block) {
      for (let channel = 0; channel < channels; channel++) {
        let reference = data[(blockY * width + blockX) * channels + channel];

        for (let dy = 0; dy < block; dy++) {
          for (let dx = 0; dx < block; dx++) {
            if (data[((blockY + dy) * width + blockX + dx) * channels + channel] !== reference) {
              throw new Error(
                `${label}: block at (${blockX}, ${blockY}) is not uniform in channel ${channel}!`,
              );
            }
          }
        }
      }
    }
  }
}

/**
 * Nearest downscale by an integer factor; lossless when the image passed
 * `assertUniformBlocks` (every output texel takes its block's single value).
 *
 * @param {RawImage} image
 * @param {number} block
 * @returns {RawImage}
 */
export function downscaleNearest({width, height, channels, data}, block) {
  // eslint-disable-next-line no-use-before-define -- hoisted function declaration
  let outWidth = divideExact(width, block, 'downscaleNearest width');
  // eslint-disable-next-line no-use-before-define -- hoisted function declaration
  let outHeight = divideExact(height, block, 'downscaleNearest height');
  let out = new Uint8Array(outWidth * outHeight * channels);

  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      for (let channel = 0; channel < channels; channel++) {
        out[(y * outWidth + x) * channels + channel] =
          data[(y * block * width + x * block) * channels + channel];
      }
    }
  }

  return {width: outWidth, height: outHeight, channels, data: out};
}

/**
 * @param {number} value
 * @param {number} divisor
 * @param {string} label
 */
export function divideExact(value, divisor, label) {
  if (value % divisor !== 0) {
    throw new Error(`${label}: ${value} is not a multiple of ${divisor}!`);
  }

  return value / divisor;
}

/**
 * ÷divisor on tileset.json pixel fields: tile/image dimensions, margin/spacing
 * and per-tile collision-rect objects. Ids and counts stay. Mutates and
 * returns the parsed JSON.
 *
 * @param {any} tileset
 * @param {number} divisor
 */
export function scaleTilesetJson(tileset, divisor) {
  for (let key of ['tilewidth', 'tileheight', 'imagewidth', 'imageheight', 'margin', 'spacing']) {
    // eslint-disable-next-line no-param-reassign -- mutation is the API contract
    tileset[key] = divideExact(tileset[key], divisor, `tileset.json ${key}`);
  }

  for (let tile of tileset.tiles ?? []) {
    for (let object of tile.objectgroup?.objects ?? []) {
      for (let key of ['x', 'y', 'width', 'height']) {
        object[key] = divideExact(
          object[key],
          divisor,
          `tileset.json tile ${tile.id} object ${key}`,
        );
      }
    }
  }

  return tileset;
}

/**
 * ÷divisor on map.json pixel fields. `width`/`height` are tile counts and
 * layer GID data is untouched; only the tile pixel size scales. Mutates and
 * returns the parsed JSON.
 *
 * @param {any} map
 * @param {number} divisor
 */
export function scaleMapJson(map, divisor) {
  // eslint-disable-next-line no-param-reassign -- mutation is the API contract
  map.tilewidth = divideExact(map.tilewidth, divisor, 'map.json tilewidth');
  // eslint-disable-next-line no-param-reassign -- mutation is the API contract
  map.tileheight = divideExact(map.tileheight, divisor, 'map.json tileheight');

  return map;
}

/**
 * ÷divisor on character.json frame rects. Animations reference frames by name
 * and are untouched. Mutates and returns the parsed JSON.
 *
 * @param {any} sheet
 * @param {number} divisor
 */
export function scaleCharacterJson(sheet, divisor) {
  for (let [name, {frame}] of Object.entries(sheet.frames)) {
    for (let key of ['x', 'y', 'w', 'h']) {
      frame[key] = divideExact(frame[key], divisor, `character.json frame ${name} ${key}`);
    }
  }

  return sheet;
}

// Numeric attributes scaled per BMFont XML tag — ported from the archived
// $/scripts-2026-07-02/scale-fnt.mjs, plus the migration's integer guard.
const SCALED_FNT_ATTRIBUTES = {
  info: ['size', 'spacing', 'padding', 'outline'],
  common: ['lineHeight', 'base', 'scaleW', 'scaleH'],
  char: ['x', 'y', 'width', 'height', 'xoffset', 'yoffset', 'xadvance'],
  kerning: ['amount'],
};

/**
 * Scale every numeric metric of a BMFont .fnt (XML) file by `factor`; throws
 * if any scaled value does not land on an integer.
 *
 * @param {string} content
 * @param {number} factor
 */
export function scaleFntContent(content, factor) {
  let scaleValue = (value, label) => {
    let scaled = Number(value) * factor;

    if (!Number.isInteger(scaled)) {
      throw new Error(`${label}: ${value} × ${factor} is not an integer!`);
    }

    return String(scaled);
  };

  let eol = content.includes('\r\n') ? '\r\n' : '\n';

  return content
    .split(/\r?\n/)
    .map((line) => {
      let tagMatch = line.match(/<(\w+)\b/);
      let attributes = tagMatch && SCALED_FNT_ATTRIBUTES[tagMatch[1]];

      if (!attributes) {
        return line;
      }

      let scaledLine = line;

      for (let attribute of attributes) {
        scaledLine = scaledLine.replace(
          new RegExp(`(\\b${attribute}=")([^"]+)(")`),
          // eslint-disable-next-line max-params -- replace() callback receives captured groups
          (_, prefix, value, suffix) =>
            `${prefix}${value
              .split(',')
              .map((part) => scaleValue(part, `${tagMatch[1]} ${attribute}`))
              .join(',')}${suffix}`,
        );
      }

      return scaledLine;
    })
    .join(eol);
}

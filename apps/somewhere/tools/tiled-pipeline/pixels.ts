import {decode} from 'fast-png';

export type TileMask = {
  width: number;
  height: number;
  solid: boolean[];
};

export type TilesetImage = {
  alphaLevels: Map<number, number>;
  columns: number;
  height: number;
  rows: number;
  tileCount: number;
  tileWidth: number;
  tileHeight: number;
  width: number;
  getTileMask: (tileId: number) => TileMask;
  getTilePixels: (tileId: number) => Uint8Array;
};

export type ReadImageOptions = {
  tileWidth: number;
  tileHeight: number;
  margin: number;
  spacing: number;
  solidAlphaThreshold: number;
  transparentColor?: string;
};

// 64 megapixels: two orders of magnitude above the 1024x1024 atlas, well under
// what decoding would exhaust.
export const MAX_IMAGE_PIXELS = 64 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// The IHDR width and height sit at fixed offsets 16 and 20, right after the
// 8-byte signature and the IHDR length/type. Reading them here means a
// decompression bomb is rejected before fast-png allocates anything.
export function assertPngWithinBounds(bytes: Uint8Array): void {
  if (bytes.length < 24 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    throw new Error('The tileset image is not a PNG file!');
  }

  let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = view.getUint32(16);
  let height = view.getUint32(20);

  if (width * height > MAX_IMAGE_PIXELS) {
    throw new Error(
      `The tileset image declares ${width}x${height} pixels, which is too large (the limit is ${MAX_IMAGE_PIXELS} pixels)!`,
    );
  }
}

function parseColorKey(transparentColor: string | undefined): [number, number, number] | undefined {
  if (transparentColor === undefined) {
    return undefined;
  }

  let value = Number.parseInt(transparentColor.replace('#', ''), 16);

  return [Math.floor(value / 0x10000) % 0x100, Math.floor(value / 0x100) % 0x100, value % 0x100];
}

function countAxis(size: number, tileSize: number, margin: number, spacing: number): number {
  let usable = size - margin + spacing;

  if (usable % (tileSize + spacing) !== 0) {
    throw new Error(
      `The tileset image size ${size} is not divisible by the tile size ${tileSize} (margin ${margin}, spacing ${spacing})!`,
    );
  }

  return usable / (tileSize + spacing);
}

export function readTilesetImage(bytes: Uint8Array, options: ReadImageOptions): TilesetImage {
  let {tileWidth, tileHeight, margin, spacing, solidAlphaThreshold, transparentColor} = options;

  if (margin !== 0) {
    throw new Error(`A nonzero tileset margin (${margin}) is not supported!`);
  }

  if (spacing !== 0) {
    throw new Error(`A nonzero tileset spacing (${spacing}) is not supported!`);
  }

  assertPngWithinBounds(bytes);

  let png = decode(bytes);
  let {width, height, channels} = png;

  // getTilePixels only reads a real alpha byte when channels === 4; for any other
  // channel count it silently forces alpha to 255, which would make every
  // non-colour-key pixel classify as solid regardless of actual transparency.
  /* eslint-disable unicorn/consistent-destructuring -- checking png.channels here, not the
     destructured `channels` used below, keeps TypeScript from narrowing `channels` to the
     literal 4, which would flag the channels 1-3 fallbacks in getTilePixels as dead code */
  if (png.channels !== 4) {
    throw new Error(
      `The tileset image has ${png.channels} channels, but only RGBA (4 channels) is supported!`,
    );
  }
  /* eslint-enable unicorn/consistent-destructuring */

  let data = Uint8Array.from(png.data as ArrayLike<number>);
  let columns = countAxis(width, tileWidth, margin, spacing);
  let rows = countAxis(height, tileHeight, margin, spacing);
  let colorKey = parseColorKey(transparentColor);
  let alphaLevels = new Map<number, number>();

  for (let index = 0; index < width * height; index++) {
    let alpha = channels === 4 ? (data[index * channels + 3] as number) : 255;

    alphaLevels.set(alpha, (alphaLevels.get(alpha) ?? 0) + 1);
  }

  let getTilePixels = (tileId: number): Uint8Array => {
    let originX = margin + (tileId % columns) * (tileWidth + spacing);
    let originY = margin + Math.floor(tileId / columns) * (tileHeight + spacing);
    let pixels = new Uint8Array(tileWidth * tileHeight * 4);

    for (let y = 0; y < tileHeight; y++) {
      for (let x = 0; x < tileWidth; x++) {
        let source = ((originY + y) * width + originX + x) * channels;
        let target = (y * tileWidth + x) * 4;

        pixels[target] = data[source] as number;
        pixels[target + 1] = data[source + (channels > 2 ? 1 : 0)] as number;
        pixels[target + 2] = data[source + (channels > 2 ? 2 : 0)] as number;
        pixels[target + 3] = channels === 4 ? (data[source + 3] as number) : 255;
      }
    }

    return pixels;
  };

  return {
    alphaLevels,
    columns,
    height,
    rows,
    tileCount: columns * rows,
    tileWidth,
    tileHeight,
    width,
    getTilePixels,
    getTileMask(tileId: number): TileMask {
      let pixels = getTilePixels(tileId);
      let solid: boolean[] = [];

      for (let index = 0; index < tileWidth * tileHeight; index++) {
        let red = pixels[index * 4] as number;
        let green = pixels[index * 4 + 1] as number;
        let blue = pixels[index * 4 + 2] as number;
        let alpha = pixels[index * 4 + 3] as number;
        let isColorKey = red === colorKey?.[0] && green === colorKey[1] && blue === colorKey[2];

        solid.push(alpha >= solidAlphaThreshold && !isColorKey);
      }

      return {width: tileWidth, height: tileHeight, solid};
    },
  };
}

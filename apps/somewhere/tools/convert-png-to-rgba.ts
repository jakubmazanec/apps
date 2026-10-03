// Expands a palette (colormap) PNG to RGBA. The tiled pipeline's decoder
// (fast-png) only accepts RGBA images, but some extracted pack atlases ship
// palette-encoded; assets/interior-tileset.png is such a conversion of
// assets/extracted/super-retro-world-interior-pack-full/atlas_16x.png. Re-run
// this after re-extracting a pack whose atlas feeds a tileset:
//
//   npx tsx tools/convert-png-to-rgba.ts <input.png> <output.png>

import {decode, encode} from 'fast-png';
import {readFileSync, writeFileSync} from 'node:fs';
import {argv, exit} from 'node:process';

export function convertPngToRgba(input: Uint8Array): Uint8Array {
  let image = decode(input);

  if (!image.palette) {
    throw new Error('The input is not a palette PNG!');
  }

  let pixelCount = image.width * image.height;
  let rgba = new Uint8Array(pixelCount * 4);

  for (let index = 0; index < pixelCount; index += 1) {
    let paletteIndex = image.data[index];
    let entry = paletteIndex === undefined ? undefined : image.palette[paletteIndex];

    if (entry === undefined) {
      throw new Error(`Palette index at pixel ${index} is out of range!`);
    }

    // fast-png exposes tRNS per-entry alpha as a fourth palette component.
    let [red = 0, green = 0, blue = 0, alpha = 255] = entry;

    rgba[index * 4] = red;
    rgba[index * 4 + 1] = green;
    rgba[index * 4 + 2] = blue;
    rgba[index * 4 + 3] = alpha;
  }

  return encode({width: image.width, height: image.height, data: rgba, channels: 4});
}

/* c8 ignore start -- entry-module guard, exercised by `npx tsx tools/convert-png-to-rgba.ts` */
if (argv[1] && import.meta.url === new URL(`file://${argv[1]}`).href) {
  let [, , inputPath, outputPath] = argv;

  if (!inputPath || !outputPath) {
    // eslint-disable-next-line no-console -- this is the CLI's output
    console.error('usage: npx tsx tools/convert-png-to-rgba.ts <input.png> <output.png>');
    exit(2);
  }

  writeFileSync(outputPath, convertPngToRgba(readFileSync(inputPath)));
}

/* c8 ignore stop */

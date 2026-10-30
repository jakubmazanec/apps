import * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {spritesetAsset} from '../source/pixi-tools/spritesetAsset.js';

describe('spritesetAsset.loader.testParse', () => {
  test('accepts Spriteset-format JSON', async () => {
    let asset = {
      image: 'spark.png',
      frames: {'1': {x: 0, y: 0, width: 4, height: 4}},
      animations: {spark: {frames: ['1']}},
    };

    await expect(spritesetAsset.loader.testParse!(asset)).resolves.toBe(true);
  });

  test('rejects old Pixi spritesheet format (has meta)', async () => {
    let asset = {
      frames: {'1': {frame: {x: 0, y: 0, w: 4, h: 4}}},
      meta: {image: 'spark.png'},
      animations: {spark: ['1']},
    };

    await expect(spritesetAsset.loader.testParse!(asset)).resolves.toBe(false);
  });

  test('rejects Tiled tileset JSON', async () => {
    let asset = {
      columns: 8,
      image: 'tileset.png',
      imageheight: 128,
      imagewidth: 128,
      margin: 0,
      name: 'tileset',
      spacing: 0,
      tilecount: 64,
      tiledversion: '1.10.0',
      tileheight: 16,
      tilewidth: 16,
      type: 'tileset',
      version: '1.10',
    };

    await expect(spritesetAsset.loader.testParse!(asset)).resolves.toBe(false);
  });

  test("loader outranks pixi's built-in spritesheet parser", () => {
    // pixi's spritesheet testParse claims any .json with a `frames` key; ours
    // must run first so the raw JSON becomes a Spriteset before pixi tests it.
    let extension = spritesetAsset.loader.extension as pixi.ExtensionMetadataDetails;

    expect(extension.priority).toBe(pixi.LoaderParserPriority.High);
  });
});

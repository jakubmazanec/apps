import * as pixi from 'pixi.js';
import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {palette} from '../source/game/core/palette.js';
import {bootGame, type Harness} from './nightScreenHelpers.js';

// Headless Chromium draws the bar in software, which slows every frame, and these tests
// check the map's pixels, not the picture, so the main menu gets the pipeline's proof.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

type Pixels = {pixels: Uint8ClampedArray; width: number; height: number};

const BLACK = palette.black;
const GROUND = palette.ground;
const WHITE = palette.white;

// The colour of a pixel as 0xRRGGBB, or -1 for a pixel that is not opaque.
function getColor({pixels, width}: Pixels, x: number, y: number): number {
  let index = (y * width + x) * 4;

  if (pixels[index + 3] !== 255) {
    return -1;
  }

  return (
    (pixels[index] ?? 0) * 0x10000 + (pixels[index + 1] ?? 0) * 0x100 + (pixels[index + 2] ?? 0)
  );
}

// The rows from `from` to `to` of column `x` that hold `color`.
function countInColumn(
  pixels: Pixels,
  x: number,
  {from, to, color}: {from: number; to: number; color: number},
): number {
  let count = 0;

  for (let y = from; y <= to; y += 1) {
    if (getColor(pixels, x, y) === color) {
      count += 1;
    }
  }

  return count;
}

describe('a pixelLine stroke in an art-size texture', {timeout: 120_000}, () => {
  let harness: Harness;
  let pixels: Pixels;

  function readPixels(texture: pixi.Texture): Pixels {
    return harness.game.app.renderer.extract.pixels({target: texture});
  }

  beforeAll(async () => {
    harness = await bootGame(960, 540);

    let target = pixi.RenderTexture.create({
      width: 40,
      height: 30,
      resolution: 1,
      scaleMode: 'nearest',
      antialias: false,
      dynamic: true,
    });
    // Units are four times the pixels, as metres are to pixels on the map.
    let lines = new pixi.GraphicsContext()
      .moveTo(8, 20)
      .lineTo(148, 20)
      .moveTo(8, 36)
      .lineTo(120, 92)
      .moveTo(20, 108)
      .lineTo(60, 108)
      .lineTo(60, 80)
      .stroke({color: palette.white, width: 1, pixelLine: true});
    let ring = new pixi.GraphicsContext()
      .poly([128, 40, 152, 40, 152, 72, 128, 72])
      .fill(palette.ground);
    let container = new pixi.Container();

    container.addChild(new pixi.Graphics(ring), new pixi.Graphics(lines));
    container.scale.set(0.25);
    container.position.set(0.3, 0.6);
    harness.game.app.renderer.render({
      container,
      target,
      clear: true,
      clearColor: palette.black,
    });
    pixels = readPixels(target);
  }, 60_000);

  afterAll(() => {
    harness.unmount();
    localStorage.clear();
  });

  test('the horizontal line is one pixel thick', () => {
    for (let x = 3; x <= 36; x += 1) {
      expect(countInColumn(pixels, x, {from: 3, to: 7, color: WHITE}), `column ${x}`).toBe(1);
    }
  });

  test('the diagonal is one pixel thick in every column', () => {
    for (let x = 3; x <= 29; x += 1) {
      let y = Math.round(9 + ((x - 2) * 14) / 28);

      expect(countInColumn(pixels, x, {from: y - 2, to: y + 2, color: WHITE}), `column ${x}`).toBe(
        1,
      );
    }
  });

  test('subpaths are not joined and a path is not closed', () => {
    expect(getColor(pixels, 19, 7)).toBe(BLACK);
    expect(getColor(pixels, 20, 7)).toBe(BLACK);
    expect(getColor(pixels, 10, 23)).toBe(BLACK);
    expect(getColor(pixels, 10, 24)).toBe(BLACK);
  });

  test('a ring is filled inside its edge', () => {
    expect(getColor(pixels, 34, 13)).toBe(GROUND);
    expect(getColor(pixels, 35, 15)).toBe(GROUND);
    expect(getColor(pixels, 31, 14)).toBe(BLACK);
  });
});

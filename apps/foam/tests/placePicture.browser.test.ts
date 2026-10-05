import * as pixi from 'pixi.js';
import {afterAll, afterEach, beforeAll, describe, expect, test, vitest} from 'vitest';

import {palette} from '../source/game/core/palette.js';
import {type PlacePicture as PlacePictureValue} from '../source/game/screens/placePicture.js';
import {bootGame, type Harness} from './nightScreenHelpers.js';
import {PROOF_PICTURE} from './proofPicture.js';

type Pixels = {pixels: Uint8ClampedArray; width: number; height: number};

const MAGENTA = palette.magenta;
const ROSE = palette.rose;
const WHITE = palette.white;

function getTexture(picture: PlacePictureValue): pixi.Texture {
  let [sprite] = picture.view.children;

  if (!(sprite instanceof pixi.Sprite)) {
    throw new TypeError('The picture has no sprite!');
  }

  return sprite.texture;
}

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

// A ticker that is never started, with the length of one frame.
function frame(deltaMS: number): pixi.Ticker {
  let ticker = new pixi.Ticker();

  ticker.deltaMS = deltaMS;

  return ticker;
}

// Frames of a headless browser are slow, so the tests get a long timeout.
describe('place picture', {timeout: 60_000}, () => {
  let harness: Harness;
  let PlacePicture: typeof PlacePictureValue;
  let pictures: PlacePictureValue[] = [];

  function createPicture(): PlacePictureValue {
    let picture = new PlacePicture({picture: PROOF_PICTURE});

    pictures.push(picture);

    return picture;
  }

  // A picture of 480 × 270, drawn at step 0.
  function createDrawnPicture(): PlacePictureValue {
    let picture = createPicture();

    picture.resize(480, 270);
    picture.update(frame(0));

    return picture;
  }

  function readPixels(picture: PlacePictureValue): Pixels {
    return harness.game.app.renderer.extract.pixels({target: getTexture(picture)});
  }

  beforeAll(async () => {
    harness = await bootGame(960, 540);
    ({PlacePicture} = await import('../source/game/screens/placePicture.js'));
  }, 60_000);

  afterEach(() => {
    for (let picture of pictures) {
      picture.destroy();
    }

    pictures = [];
  });

  afterAll(() => {
    harness.unmount();
    localStorage.clear();
  });

  test('the texture is the screen in art pixels', () => {
    let picture = createDrawnPicture();

    expect(readPixels(picture)).toMatchObject({width: 480, height: 270});

    picture.resize(480.5, 270.2);
    picture.update(frame(0));

    let pixels = readPixels(picture);

    expect(pixels).toMatchObject({width: 481, height: 271});
    // The mesh grew with the texture: the last pixel is drawn.
    expect(getColor(pixels, 480, 270)).toBe(MAGENTA);

    picture.resize(0, 270);
    picture.update(frame(0));

    expect(readPixels(picture)).toMatchObject({width: 481, height: 271});
  });

  test('every pixel is magenta, rose or white', () => {
    let pixels = readPixels(createDrawnPicture());
    let others = new Set<number>();

    for (let y = 0; y < pixels.height; y += 1) {
      for (let x = 0; x < pixels.width; x += 1) {
        let color = getColor(pixels, x, y);

        if (color !== MAGENTA && color !== ROSE && color !== WHITE) {
          others.add(color);
        }
      }
    }

    expect([...others]).toEqual([]);
  });

  test('the checkerboard follows x + y', () => {
    let pixels = readPixels(createDrawnPicture());
    let wrong = 0;

    // Row 0 is the band at step 0.
    for (let y = 1; y < pixels.height; y += 1) {
      for (let x = 0; x < pixels.width; x += 1) {
        if (getColor(pixels, x, y) !== ((x + y) % 2 === 0 ? MAGENTA : ROSE)) {
          wrong += 1;
        }
      }
    }

    expect(wrong).toBe(0);
    expect(getColor(pixels, 1, 1)).toBe(MAGENTA);
    expect(getColor(pixels, 1, 2)).toBe(ROSE);
    expect(getColor(pixels, 479, 269)).toBe(MAGENTA);

    // (0, 0) lies on the band at step 0, so it is read off the band at step 1.
    let picture = pictures[0];

    if (picture === undefined) {
      throw new Error('The picture is gone!');
    }

    picture.update(frame(1000 / 30 + 1));

    let next = readPixels(picture);

    expect(getColor(next, 0, 1)).toBe(WHITE);
    expect(getColor(next, 0, 0)).toBe(MAGENTA);
    expect(getColor(next, 1, 0)).toBe(ROSE);
    expect(getColor(next, 479, 269)).toBe(MAGENTA);
  });

  test('the band moves with the step', () => {
    let picture = createDrawnPicture();
    let first = readPixels(picture);

    expect(getColor(first, 0, 0)).toBe(WHITE);
    expect(getColor(first, 479, 0)).toBe(WHITE);
    expect(getColor(first, 0, 30)).not.toBe(WHITE);

    picture.update(frame(1000));

    let later = readPixels(picture);

    expect(getColor(later, 0, 30)).toBe(WHITE);
    expect(getColor(later, 479, 30)).toBe(WHITE);
    expect(getColor(later, 0, 0)).not.toBe(WHITE);
  });

  test('update draws once per step', () => {
    let render = vitest.spyOn(harness.game.app.renderer, 'render');

    try {
      let countDraws = (picture: PlacePictureValue): number => {
        let texture = getTexture(picture);

        return render.mock.calls.filter(
          ([options]) => (options as {target?: unknown}).target === texture,
        ).length;
      };
      let picture = createPicture();

      picture.update(frame(0));

      expect(countDraws(picture)).toBe(1);

      // Step 0 lasts 33.3 ms.
      for (let count = 0; count < 3; count += 1) {
        picture.update(frame(10));
      }

      expect(countDraws(picture)).toBe(1);

      picture.update(frame(10));

      expect(countDraws(picture)).toBe(2);

      let slow = createPicture();

      slow.speed = 0.5;
      slow.update(frame(0));

      expect(countDraws(slow)).toBe(1);

      for (let count = 0; count < 6; count += 1) {
        slow.update(frame(10));
      }

      expect(countDraws(slow)).toBe(1);

      slow.update(frame(10));

      expect(countDraws(slow)).toBe(2);
    } finally {
      render.mockRestore();
    }
  });

  test('a shader with a mistake throws in the constructor', () => {
    expect(
      () => new PlacePicture({picture: 'vec3 picture(ivec2 p, vec2 q, float t) { return nope; }'}),
    ).toThrow(/Picture shader failed to compile/);
  });

  test('destroy frees the texture', () => {
    let picture = new PlacePicture({picture: PROOF_PICTURE});
    let texture = getTexture(picture);

    picture.destroy();

    expect(texture.destroyed).toBe(true);
  });
});

import * as pixi from 'pixi.js';
import {afterAll, afterEach, beforeAll, describe, expect, test, vitest} from 'vitest';

import {barPicture} from '../source/game/content/barPicture.js';
import {palette} from '../source/game/core/palette.js';
import {type PlacePicture as PlacePictureValue} from '../source/game/screens/placePicture.js';
import {bootGame, type Harness} from './nightScreenHelpers.js';
import {PROOF_PICTURE} from './proofPicture.js';

type Pixels = {pixels: Uint8ClampedArray; width: number; height: number};

const BLACK = palette.black;
const MAGENTA = palette.magenta;
const ROSE = palette.rose;
const WHITE = palette.white;
const PALETTE_INKS = new Set<number>(Object.values(palette));
// The bar's lamps in the design of 480 × 270: two at the front, one at the back.
const LAMPS = [
  {x: 104, y: 50},
  {x: 240, y: 54},
  {x: 334, y: 58},
] as const;
// One picture step per update. The factor keeps a step from repeating, as the
// sum of many frames could otherwise round down to the step before.
const STEP_MS = (1000 / 30) * 1.0001;

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

// The screen pixel of a point of the design of 480 × 270, as the shader's
// toScreen gives it.
function toScreen(
  {x, y}: {x: number; y: number},
  {width, height}: {width: number; height: number},
): {x: number; y: number} {
  return {x: Math.floor((x * width) / 480), y: Math.floor((y * height) / 270)};
}

function isLampWhite(pixels: Pixels, lamp: {x: number; y: number}): boolean {
  let {x, y} = toScreen(lamp, pixels);

  return getColor(pixels, x, y) === WHITE;
}

function countChangedPixels(first: Pixels, second: Pixels): number {
  let count = 0;

  for (let index = 0; index < first.pixels.length; index += 4) {
    if (
      first.pixels[index] !== second.pixels[index] ||
      first.pixels[index + 1] !== second.pixels[index + 1] ||
      first.pixels[index + 2] !== second.pixels[index + 2] ||
      first.pixels[index + 3] !== second.pixels[index + 3]
    ) {
      count += 1;
    }
  }

  return count;
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

  function createBar(): PlacePictureValue {
    let picture = new PlacePicture({picture: barPicture});

    pictures.push(picture);

    return picture;
  }

  // The bar at 480 × 270, drawn at step 0.
  function createDrawnBar(): PlacePictureValue {
    let picture = createBar();

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
    let picture = createDrawnPicture();
    let pixels = readPixels(picture);
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

  test('destroy frees the texture, the mesh, its geometry and its shader, and empties the view', () => {
    let render = vitest.spyOn(harness.game.app.renderer, 'render');
    let picture = new PlacePicture({picture: PROOF_PICTURE});
    let [sprite] = picture.view.children;
    let texture = getTexture(picture);
    let mesh: unknown;

    // The mesh is never on a screen, so the test takes it from the draw into the texture.
    try {
      picture.update(frame(0));
      mesh = render.mock.calls
        .map(([options]) => options as {container?: unknown; target?: unknown})
        .find((options) => options.target === texture)?.container;
    } finally {
      render.mockRestore();
    }

    if (!(mesh instanceof pixi.Mesh)) {
      throw new TypeError('The picture drew no mesh!');
    }

    let drawn = mesh as pixi.Mesh<pixi.Geometry, pixi.Shader>;
    let destroyed: string[] = [];

    drawn.on('destroyed', () => {
      destroyed.push('mesh');
    });

    // Read before destroy(), which lets go of both.
    let {geometry, shader} = drawn;

    geometry.on('destroy', () => {
      destroyed.push('geometry');
    });
    shader?.on('destroy', () => {
      destroyed.push('shader');
    });
    picture.destroy();

    expect(texture.destroyed).toBe(true);
    expect(destroyed.toSorted()).toEqual(['geometry', 'mesh', 'shader']);
    expect(sprite?.destroyed).toBe(true);
    expect(picture.view.children).toEqual([]);
  });

  // A headless browser draws the bar in software, so these tests get a longer timeout.
  describe('the bar', {timeout: 180_000}, () => {
    test("the bar's shader compiles and draws", () => {
      expect(createBar).not.toThrow();

      let pixels = readPixels(createDrawnBar());
      let colored = 0;

      for (let y = 0; y < pixels.height; y += 1) {
        for (let x = 0; x < pixels.width; x += 1) {
          if (getColor(pixels, x, y) !== BLACK) {
            colored += 1;
          }
        }
      }

      expect(colored).toBeGreaterThan(0);
    });

    test('every pixel is one colour of the palette', () => {
      let pixels = readPixels(createDrawnBar());
      let others = new Set<number>();

      for (let y = 0; y < pixels.height; y += 1) {
        for (let x = 0; x < pixels.width; x += 1) {
          let color = getColor(pixels, x, y);

          if (!PALETTE_INKS.has(color)) {
            others.add(color);
          }
        }
      }

      expect([...others]).toEqual([]);
    });

    test('more than half of the pixels are black', () => {
      let pixels = readPixels(createDrawnBar());
      let black = 0;

      for (let y = 0; y < pixels.height; y += 1) {
        for (let x = 0; x < pixels.width; x += 1) {
          if (getColor(pixels, x, y) === BLACK) {
            black += 1;
          }
        }
      }

      expect(black).toBeGreaterThan((pixels.width * pixels.height) / 2);
    });

    // A lamp's centre depends only on the seventh of a second the step lies in: the white
    // cross is drawn unless the back lamp flickers, and the flicker is decided once per
    // seventh of a second. No other shape reaches a centre at 120 × 68 (the lamps lie at the
    // same fractions as at 480 × 270 and their crosses keep their length). So one draw in
    // the middle of each seventh of a second of a minute (420 draws) shows every state that
    // the 1800 steps of the minute can show, and a software renderer can draw it.
    test("the front lamps' centres are white in every seventh of a second of a minute, the back lamp's in most", () => {
      let picture = createBar();

      picture.resize(120, 68);
      picture.update(frame(0));

      let [first, second, back] = LAMPS;
      let frontDark = 0;
      let backWhite = 0;
      let windows = 420;

      picture.update(frame(1000 / 14));

      for (let slot = 0; slot < windows; slot += 1) {
        let pixels = readPixels(picture);

        if (!isLampWhite(pixels, first) || !isLampWhite(pixels, second)) {
          frontDark += 1;
        }

        if (isLampWhite(pixels, back)) {
          backWhite += 1;
        }

        picture.update(frame(1000 / 7));
      }

      expect(frontDark).toBe(0);
      expect(backWhite).toBeGreaterThanOrEqual(windows * 0.85);
      expect(backWhite).toBeLessThan(windows);
    }, 600_000);

    test('the same step gives the same pixels', () => {
      let picture = createDrawnBar();

      picture.update(frame(STEP_MS * 100));

      let first = readPixels(picture);

      // A resize to the same size draws the same step again.
      picture.resize(480, 270);
      picture.update(frame(0));

      let again = readPixels(picture);
      let other = createDrawnBar();

      for (let step = 0; step < 100; step += 1) {
        other.update(frame(STEP_MS));
      }

      let second = readPixels(other);

      expect(countChangedPixels(first, again)).toBe(0);
      expect(countChangedPixels(first, second)).toBe(0);
    });

    test('two steps a second apart differ', () => {
      let picture = createDrawnBar();
      let first = readPixels(picture);

      picture.update(frame(STEP_MS * 30));

      expect(countChangedPixels(first, readPixels(picture))).toBeGreaterThan(0);
    });

    // The tram passes from second 9 to second 12.5 of every 16. Every pair of steps of the
    // passage is compared, at a quarter of the pixels of 480 × 270 to keep a software
    // renderer fast enough.
    test('fewer than 3% of the pixels change from one step to the next during the tram', () => {
      let picture = createBar();

      picture.resize(240, 135);
      picture.update(frame(STEP_MS * 270));

      let before = readPixels(picture);
      let most = 0;

      for (let step = 270; step < 375; step += 1) {
        picture.update(frame(STEP_MS));

        let after = readPixels(picture);

        most = Math.max(most, countChangedPixels(before, after));
        before = after;
      }

      expect(most).toBeLessThan(240 * 135 * 0.03);
    }, 600_000);

    // The shelf's checkerboard puts its colour on the pixels where x + y is odd and black on
    // the others. Its top edge at x 240 lies at y 69.4, right under the middle lamp (240, 54,
    // radius 6), so the faint ring of the lamp's halo reaches the shelf's first rows there.
    // The box covers x 232 to 248 (the halo's reach of 6 pixels around the centre column and
    // some more) and y 70 to 73, far above the shelf's black lines, which start at about y 93.
    // It guards against the halo's faintest tone putting black on the shelf's lit pixels.
    test("a lamp's light never puts black on the shelf", () => {
      let pixels = readPixels(createDrawnBar());
      let black: string[] = [];

      for (let y = 70; y <= 73; y += 1) {
        for (let x = 232; x <= 248; x += 1) {
          if ((x + y) % 2 === 1 && getColor(pixels, x, y) === BLACK) {
            black.push(`${x},${y}`);
          }
        }
      }

      expect(black).toEqual([]);
    });

    // The middle lamp's cone at y 96 to 112 is 17 to 23 pixels wide to each side, so x 236 to
    // 244 lies inside it. The shelf there reaches from y 69 to 137, and its black lines at 36%
    // and 70% of its height lie at about y 93 to 94 and y 116 to 117, so the box lies between
    // them. Odd pixels (x + y) carry the beam, even ones keep the shelf (or black, or dust).
    test("the middle lamp's beam crosses the shelf and lets the bottles show through", () => {
      let pixels = readPixels(createDrawnBar());
      let beam = new Set<number>([palette.blue, palette.cyan]);
      let kept = new Set<number>([BLACK, MAGENTA, palette.mint, palette.plum, ROSE, WHITE]);
      let beamed = 0;
      let others: string[] = [];

      for (let y = 96; y <= 112; y += 1) {
        for (let x = 236; x <= 244; x += 1) {
          let color = getColor(pixels, x, y);

          if ((x + y) % 2 === 1) {
            if (beam.has(color)) {
              beamed += 1;
            }
          } else if (!kept.has(color)) {
            others.push(`${x},${y}`);
          }
        }
      }

      expect(beamed).toBeGreaterThan(20);
      expect(others).toEqual([]);
    });

    test('resize to 195 × 350 moves the lamps with it', () => {
      let picture = createDrawnBar();
      let back = LAMPS[2];

      // A step on which the back lamp does not flicker.
      for (let step = 0; step < 30 && !isLampWhite(readPixels(picture), back); step += 1) {
        picture.update(frame(STEP_MS));
      }

      expect(isLampWhite(readPixels(picture), back)).toBe(true);

      picture.resize(195, 350);
      picture.update(frame(0));

      let pixels = readPixels(picture);

      expect(pixels).toMatchObject({width: 195, height: 350});

      for (let lamp of LAMPS) {
        expect(isLampWhite(pixels, lamp)).toBe(true);
      }
    });
  });
});

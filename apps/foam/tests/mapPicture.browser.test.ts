import * as pixi from 'pixi.js';
import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {fitMapFrame, type MapFrame, toMapPixel} from '../source/game/core/fitMapFrame.js';
import {getMapPoint} from '../source/game/core/getMapPoint.js';
import {
  type getMapLayers as getMapLayersValue,
  type MapLayer,
} from '../source/game/core/mapLayers.js';
import {palette} from '../source/game/core/palette.js';
import {type MapData} from '../source/game/core/travel.js';
import {
  type MapMarks,
  type MapPicture as MapPictureClass,
} from '../source/game/screens/mapPicture.js';
import {FIXED_ORIGIN, fixedLocationData, fixedMap} from './fixedWorld.js';
import {bootGame, getColor, type Harness, type Pixels, readPixels} from './nightScreenHelpers.js';

// Headless Chromium draws the bar in software, which slows every frame, and these tests
// check the map's pixels, not the picture, so the main menu gets the pipeline's proof.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

const BLACK = palette.black;
const GROUND = palette.ground;
const WHITE = palette.white;

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

const EMPTY_MAP: MapData = {
  origin: FIXED_ORIGIN,
  box: {left: 0, top: 0, right: 0, bottom: 0},
  minorStreets: [],
  mainStreets: [],
  railway: [],
  rivers: [],
  parks: [],
  tramLines: [],
};

describe('the map picture', {timeout: 120_000}, () => {
  let harness: Harness;

  // The game is a singleton: both describes below share one boot.
  beforeAll(async () => {
    harness = await bootGame(960, 540);
  }, 60_000);

  afterAll(() => {
    harness.unmount();
    localStorage.clear();
  });

  describe('a pixelLine stroke in an art-size texture', {timeout: 120_000}, () => {
    let pixels: Pixels;

    beforeAll(async () => {
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
      pixels = readPixels(harness, target);
    }, 60_000);

    test('the horizontal line is one pixel thick', () => {
      for (let x = 3; x <= 36; x += 1) {
        expect(countInColumn(pixels, x, {from: 3, to: 7, color: WHITE}), `column ${x}`).toBe(1);
      }
    });

    test('the diagonal is one pixel thick in every column', () => {
      for (let x = 3; x <= 29; x += 1) {
        let y = Math.round(9 + ((x - 2) * 14) / 28);

        expect(
          countInColumn(pixels, x, {from: y - 2, to: y + 2, color: WHITE}),
          `column ${x}`,
        ).toBe(1);
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

  describe('MapPicture', {timeout: 120_000}, () => {
    let MapPicture: typeof MapPictureClass;
    let getMapLayers: typeof getMapLayersValue;
    let frame: ReturnType<typeof fitMapFrame>;
    let picture: MapPictureClass;

    // The rows from `y - 2` to `y + 2` of the column of the map pixel of this point.
    function countInColumnAt(pixels: Pixels, point: {x: number; y: number}, color: number): number {
      let {x, y} = toMapPixel(frame, point);

      return countInColumn(pixels, x, {from: y - 2, to: y + 2, color});
    }

    function countInRowAt(pixels: Pixels, point: {x: number; y: number}, color: number): number {
      let {x, y} = toMapPixel(frame, point);
      let count = 0;

      for (let column = x - 2; column <= x + 2; column += 1) {
        if (getColor(pixels, column, y) === color) {
          count += 1;
        }
      }

      return count;
    }

    // The picture's two sprites: the layer and, above it, the marks.
    function getSprites(): {layer: pixi.Sprite; marks: pixi.Sprite} {
      let [layer, marks] = picture.view.children;

      if (!(layer instanceof pixi.Sprite) || !(marks instanceof pixi.Sprite)) {
        throw new TypeError('The picture has no layer sprite or no marks sprite!');
      }

      return {layer, marks};
    }

    // Draws the layers at the frame, shows one and draws the marks over it, and reads what the
    // picture shows: the marks where they are drawn, which are opaque, and the layer elsewhere.
    function draw(drawing: Partial<MapMarks & {frame: MapFrame; layer: MapLayer}>): Pixels {
      let {
        layer = 'streets',
        frame: drawnFrame = frame,
        you = null,
        selected = null,
        buttons = [],
      } = drawing;

      picture.drawLayers(drawnFrame);
      picture.showLayer(layer);
      picture.drawMarks({you, selected, buttons});

      let sprites = getSprites();
      let layerPixels = readPixels(harness, sprites.layer.texture);
      let marks = readPixels(harness, sprites.marks.texture);
      let pixels = new Uint8ClampedArray(layerPixels.pixels);

      for (let index = 0; index < pixels.length; index += 4) {
        if (marks.pixels[index + 3] === 255) {
          pixels.set(marks.pixels.subarray(index, index + 4), index);
        }
      }

      return {pixels, width: layerPixels.width, height: layerPixels.height};
    }

    beforeAll(async () => {
      ({MapPicture} = await import('../source/game/screens/mapPicture.js'));
      ({getMapLayers} = await import('../source/game/core/mapLayers.js'));
      frame = fitMapFrame(
        Object.values(fixedLocationData).flatMap(({position}) =>
          position === undefined ? [] : [getMapPoint(position, FIXED_ORIGIN)],
        ),
        163,
        223,
        8,
      );
    }, 60_000);

    test("the texture has the frame's size", () => {
      picture = new MapPicture({map: fixedMap});

      let pixels = draw({});

      expect([pixels.width, pixels.height]).toEqual([163, 223]);

      pixels = draw({frame: {...frame, width: 120, height: 100}});

      expect([pixels.width, pixels.height]).toEqual([120, 100]);

      picture.destroy();
    });

    test('the street layer draws each line one pixel thick in its colour', () => {
      picture = new MapPicture({map: fixedMap});

      let pixels = draw({});

      expect(countInColumnAt(pixels, {x: -100, y: 0}, palette.shade)).toBe(1);
      expect(countInRowAt(pixels, {x: 150, y: -300}, palette.line)).toBe(1);
      expect(countInColumnAt(pixels, {x: 100, y: 200}, palette.dim)).toBe(1);
      expect(countInRowAt(pixels, {x: -150, y: 400}, palette.blue)).toBe(1);

      let ground = toMapPixel(frame, {x: -230, y: 100});

      expect(getColor(pixels, ground.x, ground.y)).toBe(palette.ground);

      let magentas = 0;

      for (let y = 0; y < pixels.height; y += 1) {
        for (let x = 0; x < pixels.width; x += 1) {
          if (getColor(pixels, x, y) === palette.magenta) {
            magentas += 1;
          }
        }
      }

      expect(magentas).toBe(0);

      picture.destroy();
    });

    test('the tram layer draws the tram lines instead of the streets', () => {
      picture = new MapPicture({map: fixedMap});

      let pixels = draw({layer: 'trams'});

      expect(countInColumnAt(pixels, {x: -100, y: -100}, palette.magenta)).toBe(1);
      expect(countInColumnAt(pixels, {x: -100, y: 0}, palette.shade)).toBe(0);
      expect(countInRowAt(pixels, {x: -150, y: 400}, palette.blue)).toBe(1);

      picture.destroy();
    });

    test("the light, the dotted line and the buttons' black squares", () => {
      picture = new MapPicture({map: EMPTY_MAP});

      let small = {...frame, width: 60, height: 40};
      let drawing = {
        frame: small,
        you: {x: 10, y: 20},
        selected: {x: 40, y: 20},
        buttons: [{x: 36, y: 16}],
      };
      let pixels = draw(drawing);

      expect(getColor(pixels, 10, 20)).toBe(palette.white);
      expect(getColor(pixels, 11, 20)).toBe(palette.white);
      expect(getColor(pixels, 12, 20)).toBe(palette.cyan);

      for (let x of [16, 18, 34]) {
        expect(getColor(pixels, x, 20), `x ${x}`).toBe(palette.dim);
      }

      for (let x of [17, 19, 36, 40]) {
        expect(getColor(pixels, x, 20), `x ${x}`).toBe(palette.black);
      }

      pixels = draw({...drawing, selected: null});

      expect(getColor(pixels, 16, 20)).toBe(palette.black);

      picture.destroy();
    });

    test('the marks have a texture of their own, transparent where they draw nothing', () => {
      picture = new MapPicture({map: fixedMap});
      draw({});

      let {layer, marks} = getSprites();
      let layerBefore = readPixels(harness, layer.texture);

      picture.drawMarks({you: {x: 30, y: 30}, selected: null, buttons: []});

      let marksPixels = readPixels(harness, marks.texture);
      let alphaAt = (x: number, y: number): number =>
        marksPixels.pixels[(y * marksPixels.width + x) * 4 + 3] ?? -1;

      // The layer is not drawn again, and the marks show it through, but where the light is.
      expect(readPixels(harness, layer.texture).pixels).toEqual(layerBefore.pixels);
      expect([marksPixels.width, marksPixels.height]).toEqual([163, 223]);
      expect(getColor(marksPixels, 30, 30)).toBe(WHITE);
      expect(alphaAt(100, 100)).toBe(0);

      picture.destroy();
    });

    test('a picture leaves no listener on the shared layers', () => {
      let {streets, trams} = getMapLayers(fixedMap);
      let contexts = [...new Set([...streets, ...trams])];
      let countListeners = (): number[][] =>
        contexts.map((context) => [
          context.listenerCount('update'),
          context.listenerCount('unload'),
        ]);
      let before = countListeners();

      picture = new MapPicture({map: fixedMap});
      draw({});
      picture.destroy();
      // Each drawing of the layers lets go of its Graphics before it returns, whichever layer
      // the picture shows.
      picture = new MapPicture({map: fixedMap});
      draw({});
      draw({layer: 'trams'});
      picture.destroy();

      expect(countListeners()).toEqual(before);
    });

    // After the test above: the contexts still draw once its pictures have let go of them.
    test('the layers are built once and outlive a picture', () => {
      expect(getMapLayers(fixedMap)).toBe(getMapLayers(fixedMap));

      picture = new MapPicture({map: fixedMap});
      draw({});
      picture.destroy();
      picture = new MapPicture({map: fixedMap});

      let pixels = draw({});

      expect(countInColumnAt(pixels, {x: -100, y: 0}, palette.shade)).toBe(1);

      picture.destroy();
    });
  });
});

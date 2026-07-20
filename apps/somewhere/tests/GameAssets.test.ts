/* eslint-disable @typescript-eslint/naming-convention -- test data uses hyphenated asset names */
import {afterEach, describe, expect, test, vi} from 'vitest';

import {type GameAssets as GameAssetsClass} from '../source/engine/app/GameAssets.js';

vi.mock('pixi.js', () => ({
  extensions: {add() {}},
  Spritesheet: class Spritesheet {
    textures: Record<string, unknown> = {};
  },
  Assets: {
    init: async () => {},
    loadBundle: async () => {},
    backgroundLoadBundle: async () => {},
    get: (): unknown => undefined,
    cache: {has: (): boolean => false},
  },
}));

vi.mock('../source/pixi-tools/tiledTilesetAsset.js', () => ({tiledTilesetAsset: {}}));
vi.mock('../source/pixi-tools/tiledTilemapAsset.js', () => ({tiledTilemapAsset: {}}));
vi.mock('../source/pixi-tools/audioBufferAsset.js', () => ({audioBufferAsset: {}}));

// happy-dom has no AudioBuffer; sound()'s instanceof check needs the global.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- global mock class
class StubAudioBuffer {}

vi.stubGlobal('AudioBuffer', StubAudioBuffer);

const {GameAssets} = await import('../source/engine/app/GameAssets.js');
const pixi = await import('pixi.js');

// A two-bundle manifest exercising every group kind the accessors touch.
function createAssets() {
  return new GameAssets({
    bundles: [
      {
        name: 'default',
        fonts: {monogram: ['monogram.fnt']},
        sounds: {'ui-click': ['ui-click.wav']},
        spritesheets: {ui: ['ui.json']},
      },
      {
        name: 'game',
        sounds: {bump: ['bump.wav']},
        tilemaps: {map: ['map.json']},
      },
    ],
  });
}

// Backs pixi.Assets.cache/get with a plain object for one test.
function fillCache(entries: Record<string, unknown>) {
  vi.spyOn(pixi.Assets.cache, 'has').mockImplementation((key) => String(key) in entries);
  vi.spyOn(pixi.Assets, 'get').mockImplementation(((key: string) => entries[key]) as never);
}

// The mocked class has a no-arg constructor; the cast sidesteps the real
// Spritesheet constructor signature (Sprite.test.ts precedent for cast-heavy
// pixi fakes).
function fakeSpritesheet(textures: Record<string, unknown>): unknown {
  let sheet = new (pixi.Spritesheet as unknown as new () => {
    textures: Record<string, unknown>;
  })();

  sheet.textures = textures;

  return sheet;
}

describe('GameAssets accessors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('texture returns the frame from a loaded spritesheet', () => {
    let assets = createAssets();
    let frame = {};

    fillCache({ui: fakeSpritesheet({'focus-ring': frame})});

    expect(assets.texture('ui', 'focus-ring')).toBe(frame);
  });

  test('texture throws when the spritesheet is not loaded', () => {
    let assets = createAssets();

    expect(() => assets.texture('ui', 'focus-ring')).toThrow(`Spritesheet "ui" wasn't loaded!`);
  });

  test('texture throws when the frame is missing from the sheet', () => {
    let assets = createAssets();

    fillCache({ui: fakeSpritesheet({})});

    expect(() => assets.texture('ui', 'focus-ring')).toThrow(
      'Texture "focus-ring" not found in the "ui" spritesheet!',
    );
  });

  test('texture throws when the cached value is not a spritesheet', () => {
    let assets = createAssets();

    fillCache({ui: {}});

    expect(() => assets.texture('ui', 'focus-ring')).toThrow('Asset "ui" is not a spritesheet!');
  });

  test('sound returns a loaded AudioBuffer', () => {
    let assets = createAssets();
    let buffer = new StubAudioBuffer();

    fillCache({'ui-click': buffer});

    expect(assets.sound('ui-click')).toBe(buffer);
  });

  test('sound throws when the sound is not loaded', () => {
    let assets = createAssets();

    expect(() => assets.sound('ui-click')).toThrow(`Sound "ui-click" wasn't loaded!`);
  });

  test('sound throws when the cached value is not an AudioBuffer', () => {
    let assets = createAssets();

    fillCache({'ui-click': {}});

    expect(() => assets.sound('ui-click')).toThrow('Asset "ui-click" is not a sound!');
  });

  test('accessors never call Assets.get on the miss path (no pixi cache warning)', () => {
    let assets = createAssets();
    let spy = vi.spyOn(pixi.Assets, 'get');

    expect(() => assets.sound('ui-click')).toThrow(`Sound "ui-click" wasn't loaded!`);
    expect(() => assets.texture('ui', 'focus-ring')).toThrow(`Spritesheet "ui" wasn't loaded!`);
    expect(spy).not.toHaveBeenCalled();
  });

  test('asset names are compile-time checked per group', () => {
    let assets = createAssets();

    expect(() => {
      // @ts-expect-error -- 'ui-click' is a sound name, not a spritesheet name
      assets.texture('ui-click', 'frame');
    }).toThrow(`Spritesheet "ui-click" wasn't loaded!`);
    expect(() => {
      // @ts-expect-error -- 'nope' is not a declared asset name in any group
      assets.sound('nope');
    }).toThrow(`Sound "nope" wasn't loaded!`);
    expect(() => {
      // @ts-expect-error -- 'ui' is a spritesheet name, not a sound name
      assets.sound('ui');
    }).toThrow(`Sound "ui" wasn't loaded!`);
  });

  test('a concretely typed instance is assignable to the bare GameAssets type', () => {
    // Regression guard for the readonly default type argument: with a mutable
    // default this line is a TS2322 and Game wiring breaks.
    let bare: GameAssetsClass = createAssets();

    expect(bare).toBeInstanceOf(GameAssets);
  });
});

describe('GameAssets loading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('init passes the flattened {alias, src} manifest to pixi.Assets.init', async () => {
    let assets = createAssets();
    let spy = vi.spyOn(pixi.Assets, 'init');

    await assets.init();

    expect(spy).toHaveBeenCalledWith({
      manifest: {
        bundles: [
          {
            name: 'default',
            assets: [
              {alias: 'monogram', src: ['monogram.fnt']},
              {alias: 'ui-click', src: ['ui-click.wav']},
              {alias: 'ui', src: ['ui.json']},
            ],
          },
          {
            name: 'game',
            assets: [
              {alias: 'bump', src: ['bump.wav']},
              {alias: 'map', src: ['map.json']},
            ],
          },
        ],
      },
    });
  });

  test('loadBundles rejects a bundle name missing from the manifest', async () => {
    let assets = createAssets();
    let spy = vi.spyOn(pixi.Assets, 'loadBundle');

    await expect(assets.loadBundles(['nope'])).rejects.toThrow(
      `Asset bundle "nope" doesn't exist!`,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  test('loadBundles forwards known names to pixi.Assets.loadBundle', async () => {
    let assets = createAssets();
    let spy = vi.spyOn(pixi.Assets, 'loadBundle');

    await assets.loadBundles(['default', 'game']);

    expect(spy).toHaveBeenCalledWith(['default', 'game']);
  });

  test('backgroundLoadAll passes every bundle name to backgroundLoadBundle', () => {
    let assets = createAssets();
    let spy = vi.spyOn(pixi.Assets, 'backgroundLoadBundle');

    assets.backgroundLoadAll();

    expect(spy).toHaveBeenCalledWith(['default', 'game']);
  });

  test('areBundlesLoaded is true only when every asset across the groups is cached', () => {
    let assets = createAssets();

    fillCache({monogram: {}, 'ui-click': {}, ui: {}});

    expect(assets.areBundlesLoaded(['default'])).toBeTruthy();
    // bump and map are not cached, so the grouped 'game' bundle reports cold.
    expect(assets.areBundlesLoaded(['default', 'game'])).toBeFalsy();
  });

  test('areBundlesLoaded is false for an unknown bundle without touching the cache', () => {
    let assets = createAssets();
    let spy = vi.spyOn(pixi.Assets.cache, 'has');

    expect(assets.areBundlesLoaded(['nope'])).toBeFalsy();
    expect(spy).not.toHaveBeenCalled();
  });
});

/* eslint-disable @typescript-eslint/naming-convention -- test data uses hyphenated asset names */
import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vitest} from 'vitest';

import {GameAssets, type GameAssets as GameAssetsClass} from '../source/engine/app/GameAssets.js';
import {Spriteset} from '../source/engine/graphics/Spriteset.js';
import {Tileset} from '../source/engine/tiled/Tileset.js';

// An extension descriptor with no cache/loader, so GameAssets' module-level
// `pixi.extensions.add` calls register nothing. The literal 'asset' rather than
// pixi.ExtensionType.Asset: mock factories are hoisted above the imports, so a
// static pixi binding would still be in its TDZ when they run. `as never`
// because the real exports carry those parsers and this stub deliberately does not.
const assetStub = vitest.hoisted(() => ({extension: 'asset'}));

vitest.mock(import('../source/pixi-tools/tiledTilesetAsset.js'), () => ({
  tiledTilesetAsset: assetStub as never,
}));
vitest.mock(import('../source/pixi-tools/tiledTilemapAsset.js'), () => ({
  tiledTilemapAsset: assetStub as never,
}));
vitest.mock(import('../source/pixi-tools/audioBufferAsset.js'), () => ({
  audioBufferAsset: assetStub as never,
}));
vitest.mock(import('../source/pixi-tools/spritesetAsset.js'), () => ({
  spritesetAsset: assetStub as never,
}));

class StubAudioBuffer {}

vitest.stubGlobal('AudioBuffer', StubAudioBuffer);

function createAssets() {
  return new GameAssets({
    bundles: [
      {
        name: 'default',
        fonts: {monogram: ['monogram.fnt']},
        sounds: {'ui-click': ['ui-click.wav']},
        spritesets: {ui: ['ui.json']},
      },
      {
        name: 'game',
        sounds: {bump: ['bump.wav']},
        tilemaps: {map: ['map.json']},
      },
    ],
  });
}

function fakeSpriteset(textures: Record<string, unknown>): Spriteset {
  return new Spriteset({textures: textures as never, animations: {}});
}

describe('GameAssets accessors', () => {
  afterEach(() => {
    pixi.Assets.cache.reset();
  });

  test('texture returns the frame from a loaded spriteset', () => {
    let assets = createAssets();
    let frame = {};

    pixi.Assets.cache.set('ui', fakeSpriteset({'focus-ring': frame}));

    expect(assets.texture('ui', 'focus-ring')).toBe(frame);
  });

  test('texture throws when the spriteset is not loaded', () => {
    let assets = createAssets();

    expect(() => assets.texture('ui', 'focus-ring')).toThrow(`Spriteset "ui" wasn't loaded!`);
  });

  test('texture throws when the frame is missing from the spriteset', () => {
    let assets = createAssets();

    pixi.Assets.cache.set('ui', fakeSpriteset({}));

    expect(() => assets.texture('ui', 'focus-ring')).toThrow(
      'Texture "focus-ring" not found in the "ui" spriteset!',
    );
  });

  test('texture throws when the cached value is not a spriteset', () => {
    let assets = createAssets();

    pixi.Assets.cache.set('ui', {});

    expect(() => assets.texture('ui', 'focus-ring')).toThrow('Asset "ui" is not a spriteset!');
  });

  test('spriteset returns the loaded spriteset', () => {
    let assets = createAssets();
    let spriteset = fakeSpriteset({'focus-ring': {}});

    pixi.Assets.cache.set('ui', spriteset);

    expect(assets.spriteset('ui')).toBe(spriteset);
  });

  test('spriteset throws when the spriteset is not loaded', () => {
    let assets = createAssets();

    expect(() => assets.spriteset('ui')).toThrow('Spriteset "ui" wasn\'t loaded!');
  });

  test('spriteset throws when the cached asset is not a spriteset', () => {
    let assets = createAssets();

    pixi.Assets.cache.set('ui', {});

    expect(() => assets.spriteset('ui')).toThrow('Asset "ui" is not a spriteset!');
  });

  test('sound returns a loaded AudioBuffer', () => {
    let assets = createAssets();
    let buffer = new StubAudioBuffer();

    pixi.Assets.cache.set('ui-click', buffer);

    expect(assets.sound('ui-click')).toBe(buffer);
  });

  test('sound throws when the sound is not loaded', () => {
    let assets = createAssets();

    expect(() => assets.sound('ui-click')).toThrow(`Sound "ui-click" wasn't loaded!`);
  });

  test('sound throws when the cached value is not an AudioBuffer', () => {
    let assets = createAssets();

    pixi.Assets.cache.set('ui-click', {});

    expect(() => assets.sound('ui-click')).toThrow('Asset "ui-click" is not a sound!');
  });

  test('accessors never call Assets.get on the miss path (no pixi cache warning)', () => {
    let assets = createAssets();
    let spy = vitest.spyOn(pixi.Assets, 'get');

    expect(() => assets.sound('ui-click')).toThrow(`Sound "ui-click" wasn't loaded!`);
    expect(() => assets.texture('ui', 'focus-ring')).toThrow(`Spriteset "ui" wasn't loaded!`);
    expect(spy).not.toHaveBeenCalled();
  });

  test('asset names are compile-time checked per group', () => {
    let assets = createAssets();

    expect(() => {
      // @ts-expect-error -- 'ui-click' is a sound name, not a spriteset name
      assets.texture('ui-click', 'frame');
    }).toThrow(`Spriteset "ui-click" wasn't loaded!`);
    expect(() => {
      // @ts-expect-error -- 'nope' is not a declared asset name in any group
      assets.sound('nope');
    }).toThrow(`Sound "nope" wasn't loaded!`);
    expect(() => {
      // @ts-expect-error -- 'ui' is a spriteset name, not a sound name
      assets.sound('ui');
    }).toThrow(`Sound "ui" wasn't loaded!`);
  });

  test('a concretely typed instance is assignable to the bare GameAssets type', () => {
    let bare: GameAssetsClass = createAssets();

    expect(bare).toBeInstanceOf(GameAssets);
  });
});

function createAssetsWithCharacterSpritesets() {
  return new GameAssets({
    bundles: [
      {
        name: 'game',
        tilesets: {'character-tileset': ['character-tileset.json']},
        characterSpritesets: {mira: {tileset: 'character-tileset', packIndex: 14}},
      },
    ],
  });
}

function fakeTileset(): Tileset {
  return new Tileset({tileWidth: 16, tileHeight: 20, columnCount: 12, rowCount: 32, tiles: []});
}

describe('GameAssets characterSpritesets', () => {
  afterEach(() => {
    pixi.Assets.cache.reset();
    vitest.restoreAllMocks();
  });

  test('spriteset builds it from the backing tileset via Spriteset.fromTileset', () => {
    let assets = createAssetsWithCharacterSpritesets();
    let tileset = fakeTileset();
    let built = fakeSpriteset({});
    let spy = vitest.spyOn(Spriteset, 'fromTileset').mockReturnValue(built);

    pixi.Assets.cache.set('character-tileset', tileset);

    expect(assets.spriteset('mira')).toBe(built);
    expect(spy).toHaveBeenCalledWith(tileset, 14);
  });

  test('spriteset caches the built spriteset instead of rebuilding it', () => {
    let assets = createAssetsWithCharacterSpritesets();
    let spy = vitest.spyOn(Spriteset, 'fromTileset').mockReturnValue(fakeSpriteset({}));

    pixi.Assets.cache.set('character-tileset', fakeTileset());

    assets.spriteset('mira');
    assets.spriteset('mira');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('spriteset throws when the backing tileset is not loaded yet', () => {
    let assets = createAssetsWithCharacterSpritesets();

    expect(() => assets.spriteset('mira')).toThrow(`Tileset "character-tileset" wasn't loaded!`);
  });

  test('spriteset throws when the backing asset is not a tileset', () => {
    let assets = createAssetsWithCharacterSpritesets();

    pixi.Assets.cache.set('character-tileset', {});

    expect(() => assets.spriteset('mira')).toThrow('Asset "character-tileset" is not a tileset!');
  });

  test('areBundlesLoaded checks a characterSpritesets entry via its backing tileset', () => {
    let assets = createAssetsWithCharacterSpritesets();

    expect(assets.areBundlesLoaded(['game'])).toBe(false);

    pixi.Assets.cache.set('character-tileset', fakeTileset());

    expect(assets.areBundlesLoaded(['game'])).toBe(true);
  });

  test('constructor throws when a characterSpritesets entry references an undeclared tileset', () => {
    expect(
      () =>
        new GameAssets({
          bundles: [
            {
              name: 'game',
              tilesets: {'character-tileset': ['character-tileset.json']},
              characterSpritesets: {mira: {tileset: 'nope', packIndex: 14}},
            },
          ],
        }),
    ).toThrow('Character spriteset "mira" in bundle "game" references unknown tileset "nope"!');
  });

  test('constructor does not throw when every characterSpritesets entry references a declared tileset', () => {
    expect(() => createAssetsWithCharacterSpritesets()).not.toThrow();
  });

  test('constructor resolves a characterSpritesets tileset declared in a different bundle', () => {
    expect(
      () =>
        new GameAssets({
          bundles: [
            {name: 'shared', tilesets: {'character-tileset': ['character-tileset.json']}},
            {
              name: 'game',
              characterSpritesets: {mira: {tileset: 'character-tileset', packIndex: 14}},
            },
          ],
        }),
    ).not.toThrow();
  });
});

describe('GameAssets loading', () => {
  afterEach(() => {
    vitest.restoreAllMocks();
  });

  test('init passes the flattened {alias, src} manifest to pixi.Assets.init', async () => {
    let assets = createAssets();
    let spy = vitest.spyOn(pixi.Assets, 'init').mockImplementation(async () => {});

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
    let spy = vitest.spyOn(pixi.Assets, 'loadBundle');

    await expect(assets.loadBundles(['nope'])).rejects.toThrow(
      `Asset bundle "nope" doesn't exist!`,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  test('loadBundles forwards known names to pixi.Assets.loadBundle', async () => {
    let assets = createAssets();
    let spy = vitest.spyOn(pixi.Assets, 'loadBundle').mockImplementation(async () => {});

    await assets.loadBundles(['default', 'game']);

    expect(spy).toHaveBeenCalledWith(['default', 'game']);
  });

  test('backgroundLoadAll passes every bundle name to backgroundLoadBundle', () => {
    let assets = createAssets();
    let spy = vitest.spyOn(pixi.Assets, 'backgroundLoadBundle').mockImplementation(async () => {});

    assets.loadAllBundlesInBackground();

    expect(spy).toHaveBeenCalledWith(['default', 'game']);
  });

  test('areBundlesLoaded is true only when every asset across the groups is cached', () => {
    let assets = createAssets();

    pixi.Assets.cache.set('monogram', {});
    pixi.Assets.cache.set('ui-click', {});
    pixi.Assets.cache.set('ui', {});

    expect(assets.areBundlesLoaded(['default'])).toBe(true);
    expect(assets.areBundlesLoaded(['default', 'game'])).toBe(false);
  });

  test('areBundlesLoaded throws for a bundle name missing from the manifest', () => {
    let assets = createAssets();
    let spy = vitest.spyOn(pixi.Assets.cache, 'has');

    expect(() => assets.areBundlesLoaded(['nope'])).toThrow(`Asset bundle "nope" doesn't exist!`);
    expect(spy).not.toHaveBeenCalled();
  });
});

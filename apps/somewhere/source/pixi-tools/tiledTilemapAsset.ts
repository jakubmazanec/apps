import * as pixi from 'pixi.js';

import {Tilemap} from '../engine/Tilemap.js';
import {type Tileset} from '../engine/Tileset.js';
import {type TiledTilemap, tiledTilemapSchema} from '../tiled-tools.js';

function getCacheableAssets(keys: string[], asset: Tilemap) {
  const cacheableAssets: Record<string, unknown> = {};

  keys.forEach((key: string) => {
    cacheableAssets[key] = asset;
  });

  return cacheableAssets;
}

const cache: pixi.CacheParser<Tilemap> = {
  extension: {
    type: pixi.ExtensionType.CacheParser,
    priority: pixi.LoaderParserPriority.Normal,
  },

  test: (asset: Tilemap) => asset instanceof Tilemap,

  getCacheableAssets: (keys: string[], asset: Tilemap) => getCacheableAssets(keys, asset),
};

const loader: pixi.LoaderParser<TiledTilemap> = {
  name: 'TiledTilemapAsset',
  extension: {
    type: pixi.ExtensionType.LoadParser,
    priority: pixi.LoaderParserPriority.Normal,
  },

  testParse: async (asset) => tiledTilemapSchema.safeParse(asset).success,

  parse: async <T>(
    asset: TiledTilemap,
    resolvedAsset?: pixi.ResolvedAsset,
    loader?: pixi.Loader,
  ) => {
    let tilemap = await Tilemap.from(asset);

    if (loader) {
      for (let tileset of tilemap.tilesets) {
        // let's load the tileset just in case it isn't loaded by the user
        void loader.load<Tileset>(tileset.assetName);
      }
    } else {
      throw new Error('Loader is missing!');
    }

    return tilemap as T;
  },
};

export const tiledTilemapAsset = {
  extension: pixi.ExtensionType.Asset,
  cache,
  loader,
};

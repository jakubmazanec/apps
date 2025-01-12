import * as pixi from 'pixi.js';

import {Tileset} from '../engine/Tileset.js';
import {type TiledTileset, tiledTilesetSchema} from '../tiled-tools.js';

function getCacheableAssets(keys: string[], asset: Tileset) {
  const cacheableAssets: Record<string, unknown> = {};

  keys.forEach((key: string) => {
    cacheableAssets[key] = asset;
  });

  return cacheableAssets;
}

const cache: pixi.CacheParser<Tileset> = {
  extension: {
    type: pixi.ExtensionType.CacheParser,
    priority: pixi.LoaderParserPriority.Normal,
  },

  test: (asset: Tileset) => asset instanceof Tileset,

  getCacheableAssets: (keys: string[], asset: Tileset) => getCacheableAssets(keys, asset),
};

const loader: pixi.LoaderParser<TiledTileset> = {
  name: 'TiledTilesetAsset',
  extension: {
    type: pixi.ExtensionType.LoadParser,
    priority: pixi.LoaderParserPriority.Normal,
  },

  testParse: async (asset) => tiledTilesetSchema.safeParse(asset).success,
  parse: async <T>(asset: TiledTileset) => {
    let tileset = await Tileset.from(asset);

    return tileset as T;
  },
};

export const tiledTilesetAsset = {
  extension: pixi.ExtensionType.Asset,
  cache,
  loader,
};

import * as pixi from 'pixi.js';

import {Spriteset, spritesetSchema} from '../graphics/Spriteset.js';

function getCacheableAssets(keys: string[], asset: Spriteset) {
  const cacheableAssets: Record<string, unknown> = {};

  keys.forEach((key: string) => {
    cacheableAssets[key] = asset;
  });

  return cacheableAssets;
}

const cache: pixi.CacheParser<Spriteset> = {
  extension: {
    type: pixi.ExtensionType.CacheParser,
    priority: pixi.LoaderParserPriority.Normal,
  },

  test: (asset: Spriteset) => asset instanceof Spriteset,

  getCacheableAssets: (keys: string[], asset: Spriteset) => getCacheableAssets(keys, asset),
};
const loader: pixi.LoaderParser<unknown> = {
  id: 'SpritesetAsset',
  extension: {
    type: pixi.ExtensionType.LoadParser,
    // High, not Normal: pixi's built-in spritesheet parser claims any .json
    // with a `frames` key and would crash on our meta-less format. At High
    // priority this parser transforms the JSON into a Spriteset first, and
    // pixi's testParse (`!!asset.frames`) no longer matches the instance.
    priority: pixi.LoaderParserPriority.High,
  },

  testParse: async (asset) => spritesetSchema.safeParse(asset).success,
  parse: async (asset: unknown) => {
    let spriteset = await Spriteset.from(asset);

    return spriteset;
  },
};

export const spritesetAsset = {
  extension: pixi.ExtensionType.Asset,
  cache,
  loader,
};

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

    console.log('tiledTilemapLoader loader parse...');

    if (loader) {
      for (let tileset of tilemap.tilesets) {
        // let's load the tileset just in case it isn't loaded by the user
        void loader.load<Tileset>(tileset.assetName);
      }
    } else {
      throw new Error('Loader is missing!');
    }

    console.log('tilemap', tilemap);

    return tilemap as T;
  },
};

export const tiledTilemapAsset = {
  extension: pixi.ExtensionType.Asset,
  cache,
  loader,
};

// import {
//   extensions,
//   LoaderParserPriority,
//   ExtensionType,
//   type AssetExtension,
//   type Loader,
//   type ResolvedAsset,
// } from 'pixi.js';

// import {Tilemap} from '../engine/Tilemap.js';
// import {Tilemap} from '../engine/Tilemap.js';
// import {tiledTilemapSchema, type TiledTilemap, type TiledTilemap} from '../tiled-tools.js';

// export const tiledTilemapAsset: AssetExtension<TiledTilemap> = {
//   extension: ExtensionType.Asset,

//   // cache: {
//   //   test: (asset: Spritesheet) => asset instanceof Spritesheet,
//   //   getCacheableAssets: (keys: string[], asset: Spritesheet) =>
//   //     getCacheableAssets(keys, asset, false),
//   // },

//   // /** Resolve the the resolution of the asset. */
//   // resolver: {
//   //   test: (value: string): boolean => {
//   //     console.log('resolver test', value);
//   //   },
//   //   // parse: (value: string): UnresolvedAsset => {
//   //   //   const split = value.split('.');

//   //   //   return {
//   //   //     resolution: parseFloat(settings.RETINA_PREFIX.exec(value)?.[1] ?? '1'),
//   //   //     format: split[split.length - 2],
//   //   //     src: value,
//   //   //   };
//   //   // },
//   // },

//   loader: {
//     name: 'tiledTilemapLoader',

//     extension: {
//       type: ExtensionType.LoadParser,
//       priority: LoaderParserPriority.Normal,
//     },

//     testParse: async (asset) => {
//       // console.log(2, asset, tiledTilemapSchema.safeParse(asset).success);
//       return tiledTilemapSchema.safeParse(asset).success;
//     },

//     parse: async <T>(asset: TiledTilemap, resolvedAsset?: ResolvedAsset, loader?: Loader) => {
//       // console.log(1);
//       let tilemap = await Tilemap.from(asset);

//       if (loader) {
//         for (let unloadedTilemap of tilemap.unloadedTilemaps) {
//           let tiledTilemap = await loader.load<unknown>(unloadedTilemap.source);

//           console.log('?', tiledTilemap);

//           // if (tiledTilemap) {
//           //   let tileset = await Tilemap.from(tiledTilemap, tilemap);

//           //   unloadedTilemap.load(tileset);
//           // }
//         }
//       } else {
//         throw new Error('Loader is missing!');
//       }

//       console.log('Tilemap!', tilemap);

//       return tilemap as T;
//     },

//     // unload(spritesheet: Spritesheet) {
//     //   spritesheet.destroy(true);
//     // },
//   },
// };

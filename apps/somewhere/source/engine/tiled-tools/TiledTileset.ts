import {z} from 'zod';

import {tiledGridSchema} from './TiledGrid.js';
import {tiledPropertySchema} from './TiledProperty.js';
import {tiledTerrainSchema} from './TiledTerrain.js';
import {tiledTileSchema} from './TiledTile.js';
import {tiledTileOffsetSchema} from './TiledTileOffset.js';
import {tiledTransformationsSchema} from './TiledTransformations.js';
import {tiledWangSetSchema} from './TiledWangSet.js';

export const tiledUnsourcedTilesetSchema = z.object({
  backgroundcolor: z.string().optional(),
  class: z.string().optional(),
  columns: z.number(),
  fillmode: z.enum(['preserve-aspect-fit', 'stretch']).default('stretch'),
  grid: tiledGridSchema.optional(),
  image: z.string(),
  imageheight: z.number(),
  imagewidth: z.number(),
  margin: z.number(),
  name: z.string(),
  objectalignment: z
    .enum([
      'bottom',
      'bottomleft',
      'bottomright',
      'center',
      'left',
      'right',
      'top',
      'topleft',
      'topright',
      'unspecified',
    ])
    .default('unspecified'),
  properties: z.array(tiledPropertySchema).optional(),
  spacing: z.number(),
  terrains: z.array(tiledTerrainSchema).optional(),
  tilecount: z.number(),
  tiledversion: z.string(),
  tileheight: z.number(),
  tileoffset: tiledTileOffsetSchema.optional(),
  tilerendersize: z.enum(['grid', 'tile']).default('tile'),
  tiles: z.array(tiledTileSchema).optional(),
  tilewidth: z.number(),
  transformations: tiledTransformationsSchema.optional(),
  transparentcolor: z.string().optional(),
  type: z.literal('tileset'),
  version: z.string(),
  wangsets: z.array(tiledWangSetSchema).optional(),

  // needed for TypeScript to see TiledTileset as a tagged union type
  source: z.undefined().optional(),
});

export const tiledSourcedTilesetSchema = z.object({
  firstgid: z.number(),
  source: z.string(),
});

export const tiledTilesetSchema = z.union([tiledUnsourcedTilesetSchema, tiledSourcedTilesetSchema]);

export type TiledTileset = z.infer<typeof tiledTilesetSchema>;

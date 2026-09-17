import {z} from 'zod';

import {tiledChunkSchema} from './TiledChunk.js';
import {tiledObjectSchema} from './TiledObject.js';
import {tiledPropertySchema} from './TiledProperty.js';

export const tiledObjectGroupLayerSchema = z.object({
  class: z.string().optional(),
  draworder: z.enum(['index', 'topdown']).default('topdown'),
  id: z.number(),
  locked: z.boolean().default(false),
  name: z.string(),
  objects: z.array(tiledObjectSchema),
  offsetx: z.number().default(0),
  offsety: z.number().default(0),
  opacity: z.number().min(0).max(1),
  parallaxx: z.number().default(1),
  parallaxy: z.number().default(1),
  properties: z.array(tiledPropertySchema).optional(),
  startx: z.number().optional(),
  starty: z.number().optional(),
  tintcolor: z.string().optional(),
  type: z.literal('objectgroup'),
  visible: z.boolean(),
  x: z.literal(0),
  y: z.literal(0),
});

export const tiledImageLayerSchema = z.object({
  class: z.string().optional(),
  id: z.number(),
  image: z.string(),
  locked: z.boolean().default(false),
  name: z.string(),
  offsetx: z.number().default(0),
  offsety: z.number().default(0),
  opacity: z.number().min(0).max(1),
  parallaxx: z.number().default(1),
  parallaxy: z.number().default(1),
  properties: z.array(tiledPropertySchema).optional(),
  repeatx: z.boolean().optional(),
  repeaty: z.boolean().optional(),
  startx: z.number().optional(),
  starty: z.number().optional(),
  tintcolor: z.string().optional(),
  transparentcolor: z.string().optional(),
  type: z.literal('imagelayer'),
  width: z.number(),
  x: z.literal(0),
  y: z.literal(0),
});

export const tiledTileLayerSchema = z.object({
  chunks: z.array(tiledChunkSchema).optional(),
  class: z.string().optional(),
  compression: z.enum(['gzip', 'zlib', 'zstd']).optional(),
  data: z.union([z.array(z.number()), z.string()]),
  encoding: z.enum(['csv', 'base64']).default('csv'),
  height: z.number(),
  id: z.number(),
  locked: z.boolean().default(false),
  name: z.string(),
  offsetx: z.number().default(0),
  offsety: z.number().default(0),
  opacity: z.number().min(0).max(1),
  parallaxx: z.number().default(1),
  parallaxy: z.number().default(1),
  properties: z.array(tiledPropertySchema).optional(),
  startx: z.number().optional(),
  starty: z.number().optional(),
  tintcolor: z.string().optional(),
  type: z.literal('tilelayer'),
  visible: z.boolean(),
  width: z.number(),
  x: z.literal(0),
  y: z.literal(0),
});

export const tiledGroupLayerSchema = z.object({
  class: z.string().optional(),
  id: z.number(),
  layers: z.array(
    z.union([tiledObjectGroupLayerSchema, tiledImageLayerSchema, tiledTileLayerSchema]),
  ), // Recursive types defined using Zod are not DRY, so `layers` property can only contain Tile, Image or Object group layer types; but Tiled editor allows that Group layers can contain other Group layers, so the Zod schema is actually incorrect.
  locked: z.boolean().default(false),
  name: z.string(),
  offsetx: z.number().default(0),
  offsety: z.number().default(0),
  opacity: z.number().min(0).max(1),
  parallaxx: z.number().default(1),
  parallaxy: z.number().default(1),
  properties: z.array(tiledPropertySchema).optional(),
  startx: z.number().optional(),
  starty: z.number().optional(),
  tintcolor: z.string().optional(),
  type: z.literal('group'),
  width: z.number(),
  x: z.literal(0),
  y: z.literal(0),
});

export const tiledLayerSchema = z.union([
  tiledGroupLayerSchema,
  tiledImageLayerSchema,
  tiledObjectGroupLayerSchema,
  tiledTileLayerSchema,
]);

export type TiledLayer = z.infer<typeof tiledLayerSchema>;

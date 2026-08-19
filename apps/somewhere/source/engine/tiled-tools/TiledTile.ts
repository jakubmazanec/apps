import {z} from 'zod';

import {tiledFrameSchema} from './TiledFrame.js';
import {tiledObjectGroupLayerSchema} from './TiledLayer.js';
import {tiledPropertySchema} from './TiledProperty.js';

export const tiledTileSchema = z.object({
  animation: z.array(tiledFrameSchema).optional(),
  id: z.number(),
  image: z.string().optional(),
  imageheight: z.number().optional(),
  imagewidth: z.number().optional(),
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().optional(),
  height: z.number().optional(),
  objectgroup: tiledObjectGroupLayerSchema.optional(),
  probability: z.number().optional(),
  properties: z.array(tiledPropertySchema).optional(),
  terrain: z.array(z.number()).optional(),
  type: z.string().optional(),
});

export type TiledTile = z.infer<typeof tiledTileSchema>;

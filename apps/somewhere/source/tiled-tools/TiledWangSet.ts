import {z} from 'zod';

import {tiledPropertySchema} from './TiledProperty.js';
import {tiledWangColorSchema} from './TiledWangColor.js';
import {tiledWangTileSchema} from './TiledWangTile.js';

export const tiledWangSetSchema = z.object({
  class: z.string().optional(),
  colors: z.array(tiledWangColorSchema),
  name: z.string(),
  properties: z.array(tiledPropertySchema).optional(),
  tile: z.number(),
  type: z.enum(['corner', 'edge', 'mixed']),
  wangtiles: z.array(tiledWangTileSchema),
});

export type TiledWangSetSchema = z.infer<typeof tiledWangSetSchema>;

import {z} from 'zod';

import {tiledPropertySchema} from './TiledProperty.js';

export const tiledWangColorSchema = z.object({
  class: z.string().optional(),
  color: z.string(),
  name: z.string(),
  probability: z.number(),
  properties: z.array(tiledPropertySchema).optional(),
  tile: z.number(),
});

export type TiledWangColor = z.infer<typeof tiledWangColorSchema>;

import {z} from 'zod';

import {tiledPointSchema} from './TiledPoint.js';
import {tiledPropertySchema} from './TiledProperty.js';
import {tiledTextSchema} from './TiledText.js';

export const tiledObjectSchema = z.object({
  ellipse: z.boolean().optional(),
  gid: z.number().optional(),
  height: z.number(),
  id: z.number(),
  name: z.string(),
  point: z.boolean().optional(),
  polygon: z.array(tiledPointSchema).optional(),
  polyline: z.array(tiledPointSchema).optional(),
  properties: z.array(tiledPropertySchema).optional(),
  rotation: z.number().optional(),
  template: z.string().optional(),
  text: tiledTextSchema.optional(),
  type: z.string().optional(),
  visible: z.boolean(),
  width: z.number(),
  x: z.number(),
  y: z.number(),
});

export type TiledObject = z.infer<typeof tiledObjectSchema>;

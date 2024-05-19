import {z} from 'zod';

export const tiledGridSchema = z.object({
  height: z.number(),
  orientation: z.enum(['orthogonal', 'isometric']).default('orthogonal'),
  width: z.number(),
});

export type TiledGrid = z.infer<typeof tiledGridSchema>;

import {z} from 'zod';

export const tiledPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type TiledPoint = z.infer<typeof tiledPointSchema>;

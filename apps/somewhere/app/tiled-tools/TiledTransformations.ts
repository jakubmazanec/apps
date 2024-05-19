import {z} from 'zod';

export const tiledTransformationsSchema = z.object({
  hflip: z.boolean(),
  vflip: z.boolean(),
  rotate: z.boolean(),
  preferuntransformed: z.boolean(),
});

export type TiledTransformations = z.infer<typeof tiledTransformationsSchema>;

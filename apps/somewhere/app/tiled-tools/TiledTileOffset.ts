import {z} from 'zod';

export const tiledTileOffsetSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type TiledTileOffset = z.infer<typeof tiledTileOffsetSchema>;

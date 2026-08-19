import {z} from 'zod';

export const tiledWangTileSchema = z.object({
  tileid: z.number(),
  wangid: z.array(z.number()),
});

export type TiledWangTile = z.infer<typeof tiledWangTileSchema>;

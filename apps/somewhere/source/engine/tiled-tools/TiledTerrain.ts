import {z} from 'zod';

export const tiledTerrainSchema = z.object({
  name: z.string(),
  tile: z.number(),
});

export type TiledTerrain = z.infer<typeof tiledTerrainSchema>;

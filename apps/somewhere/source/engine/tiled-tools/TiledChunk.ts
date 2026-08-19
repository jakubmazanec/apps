import {z} from 'zod';

export const tiledChunkSchema = z.object({
  data: z.union([z.array(z.number()), z.string()]),
  height: z.number(),
  width: z.number(),
  x: z.number(),
  y: z.number(),
});

export type TiledChunk = z.infer<typeof tiledChunkSchema>;

import {z} from 'zod';

export const tiledFrameSchema = z.object({
  duration: z.number(),
  tileid: z.number(),
});

export type TiledFrame = z.infer<typeof tiledFrameSchema>;

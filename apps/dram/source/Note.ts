import {z} from 'zod';

export const noteSchema = z
  .object({
    age: z.number().optional(),
    balanceRating: z.number().optional(),
    barCode: z.string().optional(),
    batch: z.string().optional(),
    bottleCode: z.string().optional(),
    bottleId: z.string().optional(),
    bottleNumber: z.string().optional(),
    bottled: z.string().optional(),
    bottler: z.string().optional(),
    bottlesCount: z.number().optional(),
    boughtAt: z.string().optional(),
    brand: z.string().optional(),
    caskNumber: z.string().optional(),
    caskType: z.string().optional(),
    color: z.string().optional(),
    distillery: z.string().optional(),
    edition: z.string().optional(),
    finish: z.string().optional(),
    finishRating: z.number().optional(),
    name: z.string().optional(),
    nose: z.string().optional(),
    noseRating: z.number().optional(),
    rating: z.number().optional(),
    score: z.number().optional(),
    size: z.number().optional(),
    strength: z.number().optional(),
    taste: z.string().optional(),
    tasteRating: z.number().optional(),
    tastedAt: z.string().optional(),
    tastingLocation: z.string().optional(),
    vintage: z.string().optional(),
    whiskybaseUrl: z.string().optional(),
    whiskyId: z.string().optional(),
    order: z.number(),
  })
  .strict();

export type Note = z.infer<typeof noteSchema>;

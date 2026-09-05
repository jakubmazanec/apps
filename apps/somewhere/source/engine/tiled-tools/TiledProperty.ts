import {z} from 'zod';

export const tiledPropertySchema = z.union([
  z.object({
    name: z.string(),
    type: z.literal('string'),
    propertytype: z.string().optional(),
    value: z.string(),
  }),
  z.object({
    name: z.string(),
    type: z.literal('bool'),
    propertytype: z.string().optional(),
    value: z.boolean(),
  }),
  z.object({
    name: z.string(),
    type: z.literal('class'),
    propertytype: z.string().optional(),
    value: z.unknown(),
  }),
  z.object({
    name: z.string(),
    type: z.literal('color'),
    propertytype: z.string().optional(),
    value: z.unknown(),
  }),
  z.object({
    name: z.string(),
    type: z.literal('file'),
    propertytype: z.string().optional(),
    value: z.unknown(),
  }),
  z.object({
    name: z.string(),
    type: z.literal('float'),
    propertytype: z.string().optional(),
    value: z.number(),
  }),
  z.object({
    name: z.string(),
    type: z.literal('int'),
    propertytype: z.string().optional(),
    value: z.number().int(),
  }),
  z.object({
    name: z.string(),
    type: z.literal('object'),
    propertytype: z.string().optional(),
    value: z.unknown(),
  }),
]);

export type TiledProperty = z.infer<typeof tiledPropertySchema>;

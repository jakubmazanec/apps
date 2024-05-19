// import {z} from 'zod';

// TODO: this is custom variant of pixi.Spritesheet - this will be a Zod schema describing JSON that represents spritesheet; to keep naming consistent, regarding naming, it will analogically to Tileset as "Spriteset.""

// export const tiledUnsourcedTilesetSchema = z.object({
//   backgroundcolor: z.string().optional(),
//   class: z.string().optional(),
//   columns: z.number(),
//   fillmode: z.enum(['preserve-aspect-fit', 'stretch']).default('stretch'),
//   grid: tiledGridSchema.optional(),
//   image: z.string(),
//   imageheight: z.number(),
//   imagewidth: z.number(),
//   margin: z.number(),
//   name: z.string(),
//   objectalignment: z
//     .enum([
//       'bottom',
//       'bottomleft',
//       'bottomright',
//       'center',
//       'left',
//       'right',
//       'top',
//       'topleft',
//       'topright',
//       'unspecified',
//     ])
//     .default('unspecified'),
//   properties: z.array(tiledPropertySchema).optional(),
//   spacing: z.number(),
//   terrains: z.array(tiledTerrainSchema).optional(),
//   tilecount: z.number(),
//   tiledversion: z.string(),
//   tileheight: z.number(),
//   tileoffset: tiledTileOffsetSchema.optional(),
//   tilerendersize: z.enum(['grid', 'tile']).default('tile'),
//   tiles: z.array(tiledTileSchema).optional(),
//   tilewidth: z.number(),
//   transformations: tiledTransformationsSchema.optional(),
//   transparentcolor: z.string().optional(),
//   type: z.literal('tileset'),
//   version: z.string(),
//   wangsets: z.array(tiledWangSetSchema).optional(),
// });

// export const tiledSourcedTilesetSchema = z.object({
//   firstgid: z.number(),
//   source: z.string(),
// });

// export const tiledTilesetSchema = z.union([tiledUnsourcedTilesetSchema, tiledSourcedTilesetSchema]);

// export type TiledTileset = z.infer<typeof tiledTilesetSchema>;

// eslint-disable-next-line @typescript-eslint/no-useless-empty-export -- TODO
export {};

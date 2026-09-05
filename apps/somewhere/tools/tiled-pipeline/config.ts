import {readFileSync} from 'node:fs';
import {isAbsolute, join, relative, resolve} from 'node:path';
import {z} from 'zod';

export const DEFAULT_CONFIG_FILE_NAME = 'tilesets.config.json';

export const collisionModeSchema = z.enum(['none', 'bbox', 'footprint', 'full']);

export type CollisionMode = z.infer<typeof collisionModeSchema>;

// Not a sandbox against hostile input: it exists so that running the tool on a
// branch you have not read cannot overwrite files outside the app.
const relativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => !isAbsolute(value) && !/^[a-zA-Z]:/u.test(value),
    'must be relative to the app root',
  )
  .refine((value) => !value.split(/[/\\]/u).includes('..'), 'must not contain ".." segments');
const collisionRegionSchema = z
  .object({
    range: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    mode: collisionModeSchema,
  })
  .refine((region) => region.range[0] <= region.range[1], 'range must be [low, high]');
const animationRegionSchema = z.object({
  start: z.number().int().min(0),
  frames: z.number().int().min(2),
  duration: z.number().int().min(1),
});

export const tilesetConfigSchema = z.object({
  name: z.string().min(1),
  source: relativePathSchema,
  image: relativePathSchema,
  output: relativePathSchema,
  outputImage: relativePathSchema,
  solidAlphaThreshold: z.number().int().min(1).max(255).default(255),
  collision: z
    .object({
      default: collisionModeSchema.default('none'),
      regions: z.array(collisionRegionSchema).default([]),
      tileClasses: z.record(z.string(), collisionModeSchema).default({}),
      footprintMaxHeight: z.number().int().min(1).default(8),
    })
    // Zod 4's `.default()` substitutes the fallback verbatim instead of parsing
    // it through the schema (unlike Zod 3), so a missing `collision` key would
    // stay `{}` instead of getting its nested defaults. `.prefault()` parses
    // the fallback, restoring that behaviour.
    .prefault({}),
  animations: z
    .object({
      regions: z.array(animationRegionSchema).default([]),
      // Lower bound on how much adjacent frames must differ (fire frames
      // measure 0.77-1.0, furniture and roof slices 0.43-0.61). This replaces
      // the old similarityThreshold ceiling, whose premise — frames are nearly
      // identical — was backwards for organic animation like fire.
      minimumFrameDifference: z.number().min(0).max(1).default(0.7),
    })
    .prefault({}),
});

export const tilesetsConfigSchema = z.object({
  tilesets: z.array(tilesetConfigSchema).min(1),
  analysis: z
    .object({
      maps: z.array(relativePathSchema).default([]),
      collisionLayerClasses: z.array(z.string()).default([]),
    })
    .optional(),
});

export type CollisionRegion = z.infer<typeof collisionRegionSchema>;
export type AnimationRegion = z.infer<typeof animationRegionSchema>;
export type TilesetConfig = z.infer<typeof tilesetConfigSchema>;
export type TilesetsConfig = z.infer<typeof tilesetsConfigSchema>;

export function resolveInsideAppRoot(appRoot: string, relativePath: string): string {
  let resolved = resolve(appRoot, relativePath);
  let inside = relative(resolve(appRoot), resolved);

  if (inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(`Path "${relativePath}" resolves outside the app root!`);
  }

  return resolved;
}

export function loadConfig(appRoot: string): TilesetsConfig {
  let config = tilesetsConfigSchema.parse(
    JSON.parse(readFileSync(join(appRoot, DEFAULT_CONFIG_FILE_NAME), 'utf8')),
  );

  for (let tileset of config.tilesets) {
    resolveInsideAppRoot(appRoot, tileset.source);
    resolveInsideAppRoot(appRoot, tileset.image);
    resolveInsideAppRoot(appRoot, tileset.output);
    resolveInsideAppRoot(appRoot, tileset.outputImage);
  }

  for (let map of config.analysis?.maps ?? []) {
    resolveInsideAppRoot(appRoot, map);
  }

  return config;
}

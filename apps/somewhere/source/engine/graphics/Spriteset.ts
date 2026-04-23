import * as pixi from 'pixi.js';
import {z} from 'zod';

const spritesetBordersSchema = z.strictObject({
  left: z.number().int().nonnegative(),
  top: z.number().int().nonnegative(),
  right: z.number().int().nonnegative(),
  bottom: z.number().int().nonnegative(),
});
const spritesetFrameSchema = z.strictObject({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  // Applied as the texture's defaultBorders, which NineSliceSprite reads.
  borders: spritesetBordersSchema.optional(),
});
const spritesetAnimationSchema = z.strictObject({
  frames: z.array(z.string()).min(1),
  // Pixi animationSpeed units; 0.15 is the speed every animation had before
  // the format carried one.
  speed: z.number().positive().default(0.15),
  loop: z.boolean().default(true),
});

// Strict throughout: an unknown key is a typo, not an extension point. There
// is deliberately no `meta` key: Pixi's built-in spritesheet parser tests
// only for a `frames` key, so a Spriteset file (which has one) would still
// be a candidate match for Pixi's parser. The real guarantee that Pixi's
// parser never runs on a Spriteset file is the spriteset loader's High
// parser priority (see spritesetAsset.ts), which transforms the JSON before
// Pixi's testParse ever sees it; `meta` stays absent so a Spriteset file is
// never a valid input to Pixi's parser if it did run.
export const spritesetSchema = z
  .strictObject({
    image: z.string().min(1),
    frames: z.record(z.string(), spritesetFrameSchema),
    animations: z.record(z.string(), spritesetAnimationSchema).default({}),
  })
  .superRefine((value, context) => {
    for (let [id, frame] of Object.entries(value.frames)) {
      if (
        frame.borders &&
        (frame.borders.left + frame.borders.right >= frame.width ||
          frame.borders.top + frame.borders.bottom >= frame.height)
      ) {
        context.addIssue({
          code: 'custom',
          message: `Frame "${id}" has borders that don't fit inside the frame!`,
          path: ['frames', id, 'borders'],
        });
      }
    }

    for (let [name, animation] of Object.entries(value.animations)) {
      for (let frameId of animation.frames) {
        if (!Object.hasOwn(value.frames, frameId)) {
          context.addIssue({
            code: 'custom',
            message: `Animation "${name}" references missing frame "${frameId}"!`,
            path: ['animations', name, 'frames'],
          });
        }
      }
    }
  });

export type SpritesetData = z.infer<typeof spritesetSchema>;

export type SpritesetAnimation = {
  textures: pixi.Texture[];
  speed: number;
  loop: boolean;
};

export type SpritesetOptions = {
  textures: Record<string, pixi.Texture>;
  animations: Record<string, SpritesetAnimation>;
};

export class Spriteset {
  /** TBD */
  readonly animations: Record<string, SpritesetAnimation>;

  /** TBD */
  readonly textures: Record<string, pixi.Texture>;

  constructor({textures, animations}: SpritesetOptions) {
    this.textures = textures;
    this.animations = animations;
  }

  /** TBD */
  static async from(source: unknown): Promise<Spriteset> {
    let spriteset = spritesetSchema.parse(source);
    let frames: Record<string, pixi.SpritesheetFrameData> = {};

    for (let [id, frame] of Object.entries(spriteset.frames)) {
      frames[id] = {
        frame: {x: frame.x, y: frame.y, w: frame.width, h: frame.height},
        // pixi.Spritesheet.parse turns frame borders into the texture's
        // defaultBorders — the same path the old ui.json relied on.
        ...(frame.borders ? {borders: frame.borders} : {}),
      };
    }

    await pixi.Assets.load(spriteset.image);

    let spritesheet = new pixi.Spritesheet(pixi.Texture.from(spriteset.image), {
      frames,
      meta: {scale: '1'},
    });

    await spritesheet.parse();

    let animations: Record<string, SpritesetAnimation> = {};

    for (let [name, animation] of Object.entries(spriteset.animations)) {
      animations[name] = {
        // The schema's superRefine guarantees every id resolves.
        textures: animation.frames.map((frameId) => spritesheet.textures[frameId]!),
        speed: animation.speed,
        loop: animation.loop,
      };
    }

    return new this({textures: spritesheet.textures, animations});
  }
}

import * as pixi from 'pixi.js';
import {z} from 'zod';

import {type Tileset} from '../tiled/Tileset.js';

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

// The SuperRetroWorld character pack's fixed layout: 8 characters per
// combined sheet (4 across, 2 down), 4 sheets stacked vertically by
// scripts/stitch-character-atlas.mjs into public/character-tileset.png.
// Each character is a 3-wide x 4-tall block of the tileset's 16x20 tiles.
const CHARACTERS_PER_SHEET = 8;
const CHARACTER_BLOCKS_PER_SHEET_ROW = 4;
const CHARACTER_BLOCK_WIDTH = 3; // tiles
const CHARACTER_BLOCK_HEIGHT = 4; // tiles
// Row order within a character's block, top to bottom. Verified against
// public/character-tileset.png and today's mira.json frame numbering.
const CHARACTER_DIRECTIONS = ['down', 'left', 'right', 'up'] as const;

function characterBlockOrigin(packIndex: number): {tileRow: number; tileCol: number} {
  let index = packIndex - 1;
  let sheet = Math.floor(index / CHARACTERS_PER_SHEET);
  let withinSheet = index % CHARACTERS_PER_SHEET;
  let colBlock = withinSheet % CHARACTER_BLOCKS_PER_SHEET_ROW;
  let rowBlock = Math.floor(withinSheet / CHARACTER_BLOCKS_PER_SHEET_ROW);

  return {
    tileCol: colBlock * CHARACTER_BLOCK_WIDTH,
    tileRow:
      sheet * (CHARACTERS_PER_SHEET / CHARACTER_BLOCKS_PER_SHEET_ROW) * CHARACTER_BLOCK_HEIGHT +
      rowBlock * CHARACTER_BLOCK_HEIGHT,
  };
}

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

  /**
   * Builds a Spriteset for one character by slicing its block out of an
   * already-loaded character-tileset — no per-character file, generated or
   * hand-authored. `packIndex` is the character's 1-based position in the
   * SuperRetroWorld pack (see characterBlockOrigin).
   */
  static fromTileset(tileset: Tileset, packIndex: number): Spriteset {
    let expectedColumnCount = CHARACTER_BLOCKS_PER_SHEET_ROW * CHARACTER_BLOCK_WIDTH;

    // The block-origin math below only holds for a 12-column atlas of 4
    // sheets x 8 characters; anything else either indexes the wrong
    // character silently or throws a confusing indirect error from deep
    // inside Tileset.getTile.
    if (!Number.isInteger(packIndex) || packIndex < 1 || packIndex > 32) {
      throw new Error(`Character packIndex must be 1-32, got ${packIndex}!`);
    }

    if (tileset.columnCount !== expectedColumnCount) {
      throw new Error(
        `Character tileset must have ${expectedColumnCount} columns for the SuperRetroWorld pack layout, got ${tileset.columnCount}!`,
      );
    }

    let {tileRow, tileCol} = characterBlockOrigin(packIndex);
    let textures: Record<string, pixi.Texture> = {};
    let animations: Record<string, SpritesetAnimation> = {};

    CHARACTER_DIRECTIONS.forEach((direction, rowOffset) => {
      let row = tileRow + rowOffset;
      let walkTextures = [0, 1, 2].map((columnOffset) => {
        let tileId = row * tileset.columnCount + tileCol + columnOffset;
        let texture = tileset.getTile(tileId).textures[0]!;

        textures[`${direction}-${columnOffset}`] = texture;

        return texture;
      });

      animations[`standing-${direction}`] = {textures: [walkTextures[1]!], speed: 0.15, loop: true};
      animations[`walking-${direction}`] = {textures: walkTextures, speed: 0.15, loop: true};
    });

    // The 4-frame player "spin" action (playerActionSystem.ts): the same
    // clip character.json hand-authored, now derived instead of authored.
    animations.spin = {
      textures: [
        animations['standing-down']!.textures[0]!,
        animations['standing-left']!.textures[0]!,
        animations['standing-up']!.textures[0]!,
        animations['standing-right']!.textures[0]!,
      ],
      speed: 0.3,
      loop: false,
    };

    return new this({textures, animations});
  }
}

import {describe, expect, test} from 'vitest';

import {Spriteset, spritesetSchema} from '../source/engine/graphics/Spriteset.js';

const VALID = {
  image: 'character.png',
  frames: {
    '1': {x: 0, y: 0, width: 16, height: 20},
    '2': {x: 16, y: 0, width: 16, height: 20},
    banner: {x: 0, y: 20, width: 146, height: 26, borders: {left: 3, top: 1, right: 3, bottom: 3}},
  },
  animations: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- kebab-case animation name from the spritesheet
    'walking-down': {frames: ['1', '2']},
    spin: {frames: ['2', '1'], speed: 0.3, loop: false},
  },
};

describe('spritesetSchema', () => {
  test('parses a valid file and applies defaults', () => {
    let result = spritesetSchema.parse(VALID);

    expect(result.animations['walking-down']).toEqual({
      frames: ['1', '2'],
      speed: 0.15,
      loop: true,
    });
    expect(result.animations.spin).toEqual({frames: ['2', '1'], speed: 0.3, loop: false});
  });

  test('animations key is optional (static sheets)', () => {
    let result = spritesetSchema.parse({
      image: 'ui.png',
      frames: {a: {x: 0, y: 0, width: 4, height: 4}},
    });

    expect(result.animations).toEqual({});
  });

  test('rejects an animation referencing a missing frame', () => {
    let invalid = {...VALID, animations: {bad: {frames: ['99']}}};

    expect(spritesetSchema.safeParse(invalid).success).toBe(false);
  });

  test('rejects non-positive speed', () => {
    let invalid = {...VALID, animations: {bad: {frames: ['1'], speed: 0}}};

    expect(spritesetSchema.safeParse(invalid).success).toBe(false);
  });

  test('rejects borders that do not fit inside the frame', () => {
    let invalid = {
      image: 'ui.png',
      frames: {
        a: {x: 0, y: 0, width: 4, height: 4, borders: {left: 2, top: 0, right: 2, bottom: 0}},
      },
    };

    expect(spritesetSchema.safeParse(invalid).success).toBe(false);
  });

  test('rejects unknown keys (strict)', () => {
    expect(spritesetSchema.safeParse({...VALID, meta: {image: 'x.png'}}).success).toBe(false);

    let typo = {
      image: 'ui.png',
      frames: {
        a: {x: 0, y: 0, width: 4, height: 4, border: {left: 1, top: 1, right: 1, bottom: 1}},
      },
    };

    expect(spritesetSchema.safeParse(typo).success).toBe(false);
  });

  test('rejects the old Pixi spritesheet format', () => {
    let old = {
      frames: {'1': {frame: {x: 0, y: 0, w: 16, h: 20}}},
      meta: {image: 'character.png'},
      // eslint-disable-next-line @typescript-eslint/naming-convention -- kebab-case animation name from the spritesheet
      animations: {'standing-down': ['1']},
    };

    expect(spritesetSchema.safeParse(old).success).toBe(false);
  });
});

describe(Spriteset, () => {
  test('constructor stores textures and animations', () => {
    let spriteset = new Spriteset({textures: {}, animations: {}});

    expect(spriteset.textures).toEqual({});
    expect(spriteset.animations).toEqual({});
  });
});

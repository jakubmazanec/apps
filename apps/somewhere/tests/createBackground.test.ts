import * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {createBackground} from '../source/engine/ui/createBackground.js';

describe(createBackground, () => {
  test('builds a nine-slice sprite from a texture with default borders', () => {
    let texture = new pixi.Texture({
      source: pixi.Texture.WHITE.source,
      defaultBorders: {left: 1, top: 2, right: 3, bottom: 4},
    });
    let background = createBackground(texture);

    expect(background).toBeInstanceOf(pixi.NineSliceSprite);
    expect((background as pixi.NineSliceSprite).leftWidth).toBe(1);
    expect((background as pixi.NineSliceSprite).topHeight).toBe(2);
    expect((background as pixi.NineSliceSprite).rightWidth).toBe(3);
    expect((background as pixi.NineSliceSprite).bottomHeight).toBe(4);
  });

  test('builds a plain sprite from a texture without default borders', () => {
    let background = createBackground(pixi.Texture.WHITE);

    expect(background).toBeInstanceOf(pixi.Sprite);
    expect(background).not.toBeInstanceOf(pixi.NineSliceSprite);
  });
});

import * as pixi from 'pixi.js';
import {describe, expect, test, vitest} from 'vitest';

import {resolveThemeBackgrounds} from '../source/ui/internals/resolveThemeBackgrounds.js';

describe(resolveThemeBackgrounds, () => {
  test('builds a background per state from the theme textures', () => {
    let textures = {normal: pixi.Texture.WHITE, hovered: pixi.Texture.WHITE};
    let resolved = resolveThemeBackgrounds(['normal', 'hovered'], textures, undefined);

    expect(resolved.normal).toBeInstanceOf(pixi.Sprite);
    expect(resolved.hovered).toBeInstanceOf(pixi.Sprite);
    expect(resolved.normal).not.toBe(resolved.hovered);
  });

  test('builds a nine-slice sprite from a texture with default borders', () => {
    let texture = new pixi.Texture({
      source: pixi.Texture.WHITE.source,
      defaultBorders: {left: 1, top: 2, right: 3, bottom: 4},
    });
    let resolved = resolveThemeBackgrounds(['normal'], {normal: texture}, undefined);

    expect(resolved.normal).toBeInstanceOf(pixi.NineSliceSprite);
    expect((resolved.normal as pixi.NineSliceSprite).leftWidth).toBe(1);
    expect((resolved.normal as pixi.NineSliceSprite).topHeight).toBe(2);
    expect((resolved.normal as pixi.NineSliceSprite).rightWidth).toBe(3);
    expect((resolved.normal as pixi.NineSliceSprite).bottomHeight).toBe(4);
  });

  test('builds a plain sprite from a texture without default borders', () => {
    let resolved = resolveThemeBackgrounds(['normal'], {normal: pixi.Texture.WHITE}, undefined);

    expect(resolved.normal).toBeInstanceOf(pixi.Sprite);
    expect(resolved.normal).not.toBeInstanceOf(pixi.NineSliceSprite);
  });

  test('an explicit background wins over the theme', () => {
    let override = new pixi.Container();
    let textures = {normal: pixi.Texture.WHITE, hovered: pixi.Texture.WHITE};
    let resolved = resolveThemeBackgrounds(['normal', 'hovered'], textures, {normal: override});

    expect(resolved.normal).toBe(override);
    expect(resolved.hovered).toBeInstanceOf(pixi.Sprite);
  });

  test('an overridden state builds nothing from the theme', () => {
    let override = new pixi.Container();
    let texture = new pixi.Texture({source: pixi.Texture.WHITE.source});
    let readDefaultBorders = vitest.fn<() => void>();

    Object.defineProperty(texture, 'defaultBorders', {get: readDefaultBorders});
    resolveThemeBackgrounds(['normal'], {normal: texture}, {normal: override});

    expect(readDefaultBorders).not.toHaveBeenCalled();
  });

  test('resolves from overrides alone when there is no theme', () => {
    let override = new pixi.Container();
    let resolved = resolveThemeBackgrounds(['normal'], undefined, {normal: override});

    expect(resolved.normal).toBe(override);
  });
});

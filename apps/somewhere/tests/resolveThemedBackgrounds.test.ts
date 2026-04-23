import * as pixi from 'pixi.js';
import {describe, expect, test, vitest} from 'vitest';

import {createBackground} from '../source/engine/ui/createBackground.js';
import {resolveThemedBackgrounds} from '../source/engine/ui/resolveThemedBackgrounds.js';

vitest.mock(import('../source/engine/ui/createBackground.js'), {spy: true});

describe(resolveThemedBackgrounds, () => {
  test('builds a background per state from the theme textures', () => {
    let textures = {normal: pixi.Texture.WHITE, hovered: pixi.Texture.WHITE};
    let resolved = resolveThemedBackgrounds(['normal', 'hovered'], textures, undefined);

    expect(resolved.normal).toBeInstanceOf(pixi.Sprite);
    expect(resolved.hovered).toBeInstanceOf(pixi.Sprite);
    expect(resolved.normal).not.toBe(resolved.hovered);
  });

  test('an explicit background wins over the theme', () => {
    let override = new pixi.Container();
    let textures = {normal: pixi.Texture.WHITE, hovered: pixi.Texture.WHITE};
    let resolved = resolveThemedBackgrounds(['normal', 'hovered'], textures, {normal: override});

    expect(resolved.normal).toBe(override);
    expect(resolved.hovered).toBeInstanceOf(pixi.Sprite);
  });

  test('an overridden state builds nothing from the theme', () => {
    let override = new pixi.Container();
    let textures = {normal: pixi.Texture.WHITE};

    vitest.mocked(createBackground).mockClear();
    resolveThemedBackgrounds(['normal'], textures, {normal: override});

    expect(createBackground).not.toHaveBeenCalled();
  });

  test('resolves from overrides alone when there is no theme', () => {
    let override = new pixi.Container();
    let resolved = resolveThemedBackgrounds(['normal'], undefined, {normal: override});

    expect(resolved.normal).toBe(override);
  });
});

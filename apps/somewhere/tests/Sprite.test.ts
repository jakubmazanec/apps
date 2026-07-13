import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {Sprite} from '../source/engine/graphics/Sprite.js';

// Three-frame animations at the engine's 0.15 animation speed: a deltaTime of
// 7 advances 7 * 0.15 = 1.05 — exactly one frame per update() call.
const FRAMES = [pixi.Texture.WHITE, pixi.Texture.WHITE, pixi.Texture.WHITE];

function tick(deltaTime: number): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

describe('Sprite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('constructs its AnimatedSprites off the shared clock (autoUpdate: false)', () => {
    vi.spyOn(pixi.Assets, 'get').mockReturnValue({
      animations: {'standing-down': FRAMES, 'walking-down': FRAMES},
    } as never);

    let sprite = new Sprite({
      assetName: 'character',
      spriteNames: ['standing-down', 'walking-down'],
    });

    for (let animatedSprite of Object.values(sprite.sprites)) {
      expect(animatedSprite.autoUpdate).toBeFalsy();
    }
  });

  test('frames advance only on driven update() calls and resume from the held frame', () => {
    vi.spyOn(pixi.Assets, 'get').mockReturnValue({
      animations: {'standing-down': FRAMES},
    } as never);

    let sprite = new Sprite({assetName: 'character', spriteNames: ['standing-down']});

    sprite.view.play();

    expect(sprite.view.currentFrame).toBe(0);

    sprite.view.update(tick(7));

    expect(sprite.view.currentFrame).toBe(1);

    // Nothing advances it between driven updates — it holds...
    expect(sprite.view.currentFrame).toBe(1);

    // ...and resumes from the held frame on the next driven update.
    sprite.view.update(tick(7));

    expect(sprite.view.currentFrame).toBe(2);
  });
});

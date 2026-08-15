import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vitest} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Spriteset} from '../source/engine/graphics/Spriteset.js';
import {type MapTile} from '../source/engine/tiled/Map.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {assets} from '../source/game/assets.js';
import {playSoundChannel} from '../source/game/audio.js';
import {GraphicsComponent} from '../source/game/GraphicsComponent.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {popupExpiredChannel} from '../source/game/popupExpiredChannel.js';
import {WallHit} from '../source/game/WallHit.js';
import {wallHitChannel} from '../source/game/wallHitChannel.js';
import {wallHitPopupSystem} from '../source/game/wallHitPopupSystem.js';

function tick(deltaTime: number): pixi.Ticker {
  return {deltaTime, deltaMS: deltaTime} as unknown as pixi.Ticker;
}

describe('wallHitPopupSystem', () => {
  afterEach(() => {
    vitest.restoreAllMocks();
  });

  test('spawns a single-sprite, non-directional popup', () => {
    let t = () => pixi.Texture.WHITE;
    let sparkSpriteset = new Spriteset({
      textures: {},
      animations: {spark: {textures: [t()], speed: 0.15, loop: true}},
    });
    let characterSpriteset = new Spriteset({
      textures: {},
      // eslint-disable-next-line @typescript-eslint/naming-convention -- kebab-case animation name from the spritesheet
      animations: {'standing-down': {textures: [t()], speed: 0.15, loop: true}},
    });

    vitest.spyOn(assets, 'spriteset').mockImplementation((name: string) => {
      if (name === 'spark') {
        return sparkSpriteset;
      }

      if (name === 'character') {
        return characterSpriteset;
      }

      throw new Error(`Unknown spriteset: ${name}`);
    });

    let player = new Entity({
      components: [
        new MotionComponent({position: new Vector(0, 0), velocity: new Vector(0, 0)}),
        new GraphicsComponent({
          spriteOptions: {assetName: 'character', spriteNames: ['standing-down']},
          boundingBox: new pixi.Rectangle(0, 10, 16, 10),
        }),
      ],
    });
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(wallHitChannel)
          .addEventChannel(playSoundChannel)
          .addEventChannel(popupExpiredChannel)
          .addSystem(wallHitPopupSystem)
          .addEntity(player);
      },
    });

    world.start();

    // The system never reads `tile` (only entity and box), so a stub cast is
    // honest here.
    wallHitChannel.push(
      new WallHit({
        entity: player,
        tile: {x: 1, y: 0} as unknown as MapTile,
        box: new pixi.Rectangle(16, 0, 16, 16),
      }),
    );

    world.update(tick(16)); // event buffered
    world.update(tick(16)); // event surfaces; popup spawns (addEntity is deferred to end of update)

    let popup = world.entities.find(
      (entity) => entity !== player && entity.hasComponent(GraphicsComponent),
    );

    expect(popup).toBeDefined();

    let graphics = popup!.getComponent(GraphicsComponent);

    expect(graphics.directional).toBe(false);
    expect(graphics.sprite.currentSpriteName).toBe('spark');
    expect(Object.keys(graphics.sprite.sprites)).toEqual(['spark']);

    world.stop();
  });
});

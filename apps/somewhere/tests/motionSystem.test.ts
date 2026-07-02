import type * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {type Component} from '../source/engine/ecs/Component.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {GraphicsComponent} from '../source/game/GraphicsComponent.js';
import {LevelComponent} from '../source/game/LevelComponent.js';
import {levelQuery} from '../source/game/levelQuery.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {motionSystem} from '../source/game/motionSystem.js';
import {wallHitChannel} from '../source/game/wallHitChannel.js';
import {type Constructor} from '../source/utilities/Constructor.js';

function tick(deltaTime: number): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

function createMapStub() {
  // one solid tile at x 32..64, y 0..32; everything else empty
  let solid = {view: {x: 32, y: 0}, boundingBox: {x: 0, y: 0, width: 32, height: 32}};
  let empty = {view: {x: 0, y: 0}, boundingBox: undefined};

  return {
    columnCount: 2,
    rowCount: 1,
    width: 64,
    height: 32,
    layers: [undefined, {tiles: [[empty], [solid]]}],
  };
}

// LevelComponent/GraphicsComponent build a real Map/Sprite from an asset name in their
// constructors, which needs pixi.Assets to already have a loaded tilemap/spritesheet. Bypass
// the constructor and assign the stub fields onto the real prototype instead, so
// `entity.getComponent` (keyed by `.constructor`) still resolves it as the real component class.
function stubComponent<T extends Component>(ComponentClass: Constructor<T>, fields: object): T {
  return Object.assign(Object.create(ComponentClass.prototype as object) as T, fields);
}

describe('motionSystem wall hits', () => {
  test('sustained contact fires exactly one WallHit; re-contact fires again', () => {
    let map = createMapStub();
    let level = new Entity({components: [stubComponent(LevelComponent, {map})]});
    let motion = new MotionComponent({position: new Vector(20, 0), velocity: new Vector(4, 0)});
    let player = new Entity({
      components: [
        motion,
        stubComponent(GraphicsComponent, {boundingBox: {x: 0, y: 0, width: 8, height: 8}}),
      ],
    });
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(wallHitChannel)
          .addEntityQuery(levelQuery)
          .addSystem(motionSystem)
          .addEntity(level)
          .addEntity(player);
      },
    });

    world.start();

    // frame 1: approaches the wall, tentative move doesn't overlap yet
    motion.velocity.x = 4;
    world.update(tick(1));

    // frame 2: tentative move overlaps; contact begins, one WallHit fires
    motion.velocity.x = 4;
    world.update(tick(1));

    expect(wallHitChannel.events).toHaveLength(1);

    // frame 3: still pushing; sustained contact fires no new event
    motion.velocity.x = 4;
    world.update(tick(1));

    expect(wallHitChannel.events).toHaveLength(0);

    // walk away, then push again: a new contact episode fires a new event
    motion.velocity.x = -4;
    world.update(tick(1));
    motion.velocity.x = 4;
    world.update(tick(1));
    motion.velocity.x = 4;
    world.update(tick(1));

    expect(wallHitChannel.events).toHaveLength(1);

    world.stop();
  });
});

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
  let solid = {view: {x: 32, y: 0}, collisionBoxes: [{x: 0, y: 0, width: 32, height: 32}]};
  let empty = {view: {x: 0, y: 0}, collisionBoxes: []};

  return {
    columnCount: 2,
    rowCount: 1,
    width: 64,
    height: 32,
    layers: [undefined, {tiles: [[empty], [solid]]}],
    entityLayerIndex: 1,
  };
}

// LevelComponent/GraphicsComponent build a real Map/Sprite from an asset name in their
// constructors, which needs pixi.Assets to already have a loaded tilemap/spritesheet. Bypass
// the constructor and assign the stub fields onto the real prototype instead, so
// `entity.getComponent` (keyed by `.constructor`) still resolves it as the real component class.
function stubComponent<T extends Component>(ComponentClass: Constructor<T>, fields: object): T {
  return Object.assign(Object.create(ComponentClass.prototype as object) as T, fields);
}

function createWorldWithPlayerNearWall() {
  let level = new Entity({components: [stubComponent(LevelComponent, {map: createMapStub()})]});
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

  return {world, motion};
}

describe('motionSystem wall hits', () => {
  test('sustained contact fires exactly one WallHit; re-contact fires again', () => {
    let {world, motion} = createWorldWithPlayerNearWall();

    world.start();

    // frame 1: approaches the wall, tentative move doesn't overlap yet
    motion.velocity.x = 4;
    world.update(tick(1));

    // frame 2: tentative move overlaps; contact begins, one WallHit fires
    motion.velocity.x = 4;
    world.update(tick(1));

    expect(wallHitChannel.events).toHaveLength(1);

    // The event carries the map-space rectangle that clipped the movement.
    expect(wallHitChannel.events[0]!.box).toMatchObject({x: 32, y: 0, width: 32, height: 32});

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

  test('resting flush against the wall keeps contact; pushing again fires no new WallHit', () => {
    let {world, motion} = createWorldWithPlayerNearWall();

    world.start();

    // drive into the wall: contact begins on the second frame
    motion.velocity.x = 4;
    world.update(tick(1));
    motion.velocity.x = 4;
    world.update(tick(1));

    expect(wallHitChannel.events).toHaveLength(1);

    // rest flush against the wall: the system zeroed velocity, both passes skip
    world.update(tick(1));
    world.update(tick(1));

    // push toward the same wall again: still the same contact episode
    motion.velocity.x = 4;
    world.update(tick(1));

    expect(wallHitChannel.events).toHaveLength(0);

    // walk away, then re-contact: a new episode fires exactly one new event
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

// One tile at x 32..64 carrying two small boxes: a top-left block at map-space
// (32, 0, 4, 8) and a bottom-left block at (32, 24, 4, 8).
function createMultiBoxWorld(playerAt: {x: number; y: number}, velocity: {x: number; y: number}) {
  let solid = {
    view: {x: 32, y: 0},
    collisionBoxes: [
      {x: 0, y: 0, width: 4, height: 8},
      {x: 0, y: 24, width: 4, height: 8},
    ],
  };
  let empty = {view: {x: 0, y: 0}, collisionBoxes: []};
  let map = {
    columnCount: 2,
    rowCount: 1,
    width: 64,
    height: 32,
    layers: [undefined, {tiles: [[empty], [solid]]}],
    entityLayerIndex: 1,
  };
  let level = new Entity({components: [stubComponent(LevelComponent, {map})]});
  let motion = new MotionComponent({
    position: new Vector(playerAt.x, playerAt.y),
    velocity: new Vector(velocity.x, velocity.y),
  });
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

  return {world, motion};
}

describe('motionSystem multi-box tiles', () => {
  test('the X pass reports the specific box it clipped against', () => {
    // Moving right at y 24 can only hit the bottom box (32, 24, 4, 8).
    let {world, motion} = createMultiBoxWorld({x: 20, y: 24}, {x: 8, y: 0});

    world.start();
    world.update(tick(1));

    // Contact begins this frame; the end-of-update swap makes the event
    // readable immediately (same rhythm as the existing wall-hit tests).
    expect(motion.position.x).toBe(24); // clipped flush against the box
    expect(wallHitChannel.events).toHaveLength(1);
    expect(wallHitChannel.events[0]!.box).toMatchObject({x: 32, y: 24, width: 4, height: 8});

    world.stop();
  });

  test('the Y pass reports the specific box it clipped against', () => {
    // Moving down at x 33 (inside the boxes' 32..36 column) from above the
    // bottom box.
    let {world, motion} = createMultiBoxWorld({x: 33, y: 10}, {x: 0, y: 10});

    world.start();
    world.update(tick(1));

    expect(motion.position.y).toBe(16); // clipped flush against the box top (24 - 8)
    expect(wallHitChannel.events).toHaveLength(1);
    expect(wallHitChannel.events[0]!.box).toMatchObject({x: 32, y: 24, width: 4, height: 8});

    world.stop();
  });
});

import type * as pixi from 'pixi.js';
import {afterEach, describe, expect, test} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {type MapTile} from '../source/engine/tiled/Map.js';
import {uiBridge} from '../source/game/uiBridge.js';
import {uiEvents} from '../source/game/uiEvents.js';
import {WallHit} from '../source/game/WallHit.js';
import {wallHitChannel} from '../source/game/wallHitChannel.js';

let entity = new Entity({components: []});
let box = {} as unknown as pixi.Rectangle;

function withBridge(run: (world: World) => void) {
  let world = new World();

  world.addEventChannel(wallHitChannel);
  world.addSystem(uiBridge);

  try {
    run(world);
  } finally {
    world.removeSystem(uiBridge);
    world.removeEventChannel(wallHitChannel);
  }
}

describe('uiBridge', () => {
  afterEach(() => {
    uiEvents.removeAllListeners();
    wallHitChannel.clear();
  });

  test('emits world:wallHit on the bus when the channel has a buffered event', () => {
    let tile = {} as unknown as MapTile;
    let received: Array<{tile: MapTile}> = [];

    uiEvents.on('world:wallHit', (payload) => {
      received.push(payload);
    });

    withBridge((world) => {
      wallHitChannel.push(new WallHit({entity, tile, box}));
      wallHitChannel.swap();
      world.update({deltaTime: 1} as never);
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({tile});
  });

  test('emits one event per buffered event, in push order', () => {
    let tileA = {} as unknown as MapTile;
    let tileB = {} as unknown as MapTile;
    let received: Array<{tile: MapTile}> = [];

    uiEvents.on('world:wallHit', (payload) => {
      received.push(payload);
    });

    withBridge((world) => {
      wallHitChannel.push(new WallHit({entity, tile: tileA, box}));
      wallHitChannel.push(new WallHit({entity, tile: tileB, box}));
      wallHitChannel.swap();
      world.update({deltaTime: 1} as never);
    });

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({tile: tileA});
    expect(received[1]).toEqual({tile: tileB});
  });

  test('emits nothing when the channel is empty', () => {
    let fired = 0;

    uiEvents.on('world:wallHit', () => {
      fired += 1;
    });

    withBridge((world) => {
      world.update({deltaTime: 1} as never);
    });

    expect(fired).toBe(0);
  });
});

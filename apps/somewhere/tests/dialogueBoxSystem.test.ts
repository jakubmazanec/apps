import type * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';

vi.mock('../source/game/game.js', () => ({
  game: {app: {screen: {width: 480, height: 270}}, pixelScale: 2},
}));

const {DialogueComponent} = await import('../source/game/DialogueComponent.js');
const {dialogueBoxSystem} = await import('../source/game/dialogueBoxSystem.js');
const {dialogueQuery} = await import('../source/game/dialogueQuery.js');

function tick(deltaMS = 0): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

let activeWorld: World | null = null;

function createWorld() {
  let dialogueEntity = new Entity({components: [new DialogueComponent({active: null})]});
  let world = new World({
    onStart: (w) => {
      w.addEntityQuery(dialogueQuery).addSystem(dialogueBoxSystem).addEntity(dialogueEntity);
    },
  });

  activeWorld = world;

  return {world};
}

describe('dialogueBoxSystem', () => {
  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
  });

  test('attaches its layer to the world view lazily on first update', () => {
    let {world} = createWorld();

    world.start();

    expect(world.view.children).toHaveLength(0); // nothing in onAdd

    world.update(tick());

    expect(world.view.children).toHaveLength(1);

    world.update(tick());

    expect(world.view.children).toHaveLength(1); // still one layer
  });

  test('onRemove destroys the layer and survives a rerun (World.view is reused)', () => {
    let {world} = createWorld();

    world.start();
    world.update(tick());

    let layer = world.view.children[0];

    world.stop();

    expect(world.view.children).toHaveLength(0);
    expect(layer?.destroyed).toBeTruthy();

    // A fresh run must re-create the layer from scratch.
    let second = createWorld();

    second.world.start();
    second.world.update(tick());

    expect(second.world.view.children).toHaveLength(1);
  });

  test('an update with no active dialogue and no npc in range creates no box', () => {
    let {world} = createWorld();

    world.start();
    world.update(tick());

    let layer = world.view.children[0] as pixi.Container;

    expect(layer.children).toHaveLength(0); // no box view, no prompt sprite
  });
});

import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {playSoundChannel} from '../source/game/audio.js';
import {TriggerComponent} from '../source/game/TriggerComponent.js';
import {TriggerEnter} from '../source/game/TriggerEnter.js';
import {triggerEnterChannel} from '../source/game/triggerEnterChannel.js';
import {zoneSystem} from '../source/game/zoneSystem.js';

function tick(deltaTime = 1): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

let entity = new Entity({components: []});

function createTrigger(type: string, properties: Record<string, boolean | number | string>) {
  return new Entity({
    components: [
      new TriggerComponent({
        id: 1,
        name: 'trigger',
        type,
        rect: new pixi.Rectangle(0, 0, 16, 16),
        properties,
      }),
    ],
  });
}

let activeWorld: World | null = null;

function createWorld(trigger: Entity) {
  let world = new World({
    onStart: (w) => {
      w.addEventChannel(triggerEnterChannel)
        .addEventChannel(playSoundChannel)
        .addSystem(zoneSystem)
        .addEntity(trigger);
    },
  });

  activeWorld = world;

  return world;
}

describe('zoneSystem', () => {
  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
  });

  test('a zone enter with a sound property pushes PlaySound', () => {
    let trigger = createTrigger('zone', {sound: 'chime'});
    let world = createWorld(trigger);

    world.start();
    triggerEnterChannel.push(new TriggerEnter({entity, trigger}));
    triggerEnterChannel.swap();
    world.update(tick());

    expect(playSoundChannel.events).toHaveLength(1);
    expect(playSoundChannel.events[0]!.name).toBe('chime');
  });

  test('a zone without a sound property stays silent but valid', () => {
    let trigger = createTrigger('zone', {});
    let world = createWorld(trigger);

    world.start();
    triggerEnterChannel.push(new TriggerEnter({entity, trigger}));
    triggerEnterChannel.swap();
    world.update(tick());

    expect(playSoundChannel.events).toHaveLength(0);
  });

  test('a door enter is ignored', () => {
    let trigger = createTrigger('door', {sound: 'chime'});
    let world = createWorld(trigger);

    world.start();
    triggerEnterChannel.push(new TriggerEnter({entity, trigger}));
    triggerEnterChannel.swap();
    world.update(tick());

    expect(playSoundChannel.events).toHaveLength(0);
  });
});

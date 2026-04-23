import type * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {defineEvent} from '../source/engine/ecs/Event.js';
import {EventChannel} from '../source/engine/ecs/EventChannel.js';
import {World} from '../source/engine/ecs/World.js';
import {Timer} from '../source/engine/scheduler/Timer.js';
import {TimerComponent} from '../source/engine/scheduler/TimerComponent.js';
import {timerSystem} from '../source/engine/scheduler/timerSystem.js';

const Fired = defineEvent<{value: number}>();

function tick(deltaMS: number): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

describe('timerSystem', () => {
  test('emits the entry event on its channel the frame the timer fires, then splices a one-shot', () => {
    let channel = new EventChannel({event: Fired, displayName: 'Fired'});
    let event = new Fired({value: 7});
    let entity = new Entity({
      components: [
        new TimerComponent({timers: [{timer: new Timer({duration: 100}), emit: {channel, event}}]}),
      ],
    });
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(channel).addSystem(timerSystem).addEntity(entity);
      },
    });

    world.start();

    expect(channel.events).toHaveLength(0);

    world.update(tick(100)); // fires -> push -> World swaps channels at end of update

    expect(channel.events).toHaveLength(1);
    expect(channel.events[0]).toBe(event);
    expect(entity.getComponent(TimerComponent).timers).toHaveLength(0); // one-shot removed itself

    world.stop();
  });

  test('a repeat timer keeps its entry and re-emits each period', () => {
    let channel = new EventChannel({event: Fired, displayName: 'Fired'});
    let entity = new Entity({
      components: [
        new TimerComponent({
          timers: [
            {
              timer: new Timer({duration: 100, repeat: true}),
              emit: {channel, event: new Fired({value: 1})},
            },
          ],
        }),
      ],
    });
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(channel).addSystem(timerSystem).addEntity(entity);
      },
    });

    world.start();
    world.update(tick(100));

    expect(channel.events).toHaveLength(1);

    world.update(tick(100));

    expect(channel.events).toHaveLength(1); // fired again the next period
    expect(entity.getComponent(TimerComponent).timers).toHaveLength(1); // entry still present

    world.stop();
  });
});

import type * as pixi from 'pixi.js';
import {defineEvent, Entity, EventChannel, Tween, World} from 'tellurion';
import {describe, expect, test} from 'vitest';

import {TweenComponent} from '../source/game/components/TweenComponent.js';
import {tweenSystem} from '../source/game/systems/tweenSystem.js';

const Fired = defineEvent<{value: number}>();

function tick(deltaMS: number): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

describe('tweenSystem', () => {
  test('advances tween entries and removes them on completion', () => {
    let target = {value: 0};
    let entity = new Entity({
      components: [
        new TweenComponent({
          tweens: [new Tween({target, to: {value: 10}, duration: 100})],
        }),
      ],
    });
    let world = new World({
      onStart: (w) => {
        w.addSystem(tweenSystem).addEntity(entity);
      },
    });

    world.start();
    world.update(tick(50));

    expect(target.value).toBeCloseTo(5);
    expect(entity.getComponent(TweenComponent).tweens).toHaveLength(1);

    world.update(tick(50));

    expect(target.value).toBeCloseTo(10);
    expect(entity.getComponent(TweenComponent).tweens).toHaveLength(0);

    world.stop();
  });

  test('pushes the completion event on its channel and removes the tween', () => {
    let channel = new EventChannel({event: Fired, displayName: 'Fired'});
    let event = new Fired({value: 7});
    let target = {value: 0};
    let entity = new Entity({
      components: [
        new TweenComponent({
          tweens: [new Tween({target, to: {value: 10}, duration: 100, channel, event})],
        }),
      ],
    });
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(channel).addSystem(tweenSystem).addEntity(entity);
      },
    });

    world.start();
    world.update(tick(100));

    expect(channel.events).toHaveLength(1);
    expect(channel.events[0]).toBe(event);
    expect(entity.getComponent(TweenComponent).tweens).toHaveLength(0);

    world.stop();
  });
});

import type * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Tween} from '../source/engine/scheduler/Tween.js';
import {TweenComponent} from '../source/engine/scheduler/TweenComponent.js';
import {tweenSystem} from '../source/engine/scheduler/tweenSystem.js';

function tick(deltaMS: number): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

describe('tweenSystem', () => {
  test('advances tween entries and removes them on completion', () => {
    let target = {value: 0};
    let entity = new Entity({
      components: [
        new TweenComponent({
          tweens: [{tween: new Tween({target, to: {value: 10}, duration: 100})}],
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
});

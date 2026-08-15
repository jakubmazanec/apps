import {afterEach, describe, expect, test, vitest} from 'vitest';

import {Vector} from '../source/engine/utilities/Vector.js';
import {BehaviorComponent, randomStrollWait} from '../source/game/BehaviorComponent.js';

describe(BehaviorComponent, () => {
  afterEach(() => {
    vitest.restoreAllMocks();
  });

  test('randomStrollWait spans 3000–8000 ms across the Math.random range', () => {
    vitest.spyOn(Math, 'random').mockReturnValue(0);

    expect(randomStrollWait()).toBe(3000);

    vitest.mocked(Math.random).mockReturnValue(0.5);

    expect(randomStrollWait()).toBe(5500);

    vitest.mocked(Math.random).mockReturnValue(0.999);

    expect(randomStrollWait()).toBeLessThan(8000);
  });

  test('carries the stroll behavior as given', () => {
    let behavior = {
      type: 'stroll' as const,
      home: new Vector(244, 180),
      destination: new Vector(292, 180),
      goal: 'destination' as const,
      phase: 'waiting' as const,
      waitRemaining: 4000,
    };

    expect(new BehaviorComponent({behavior}).behavior).toBe(behavior);
  });
});

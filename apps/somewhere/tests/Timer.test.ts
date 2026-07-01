import type * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {Timer} from '../source/engine/scheduler/Timer.js';

function tick(deltaMS: number): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

describe('Timer', () => {
  test('one-shot fires exactly once when elapsed reaches duration', () => {
    let timer = new Timer({duration: 100});

    expect(timer.update(tick(50))).toBeFalsy();
    expect(timer.update(tick(50))).toBeTruthy();
    expect(timer.update(tick(50))).toBeFalsy(); // finished; never fires again
  });

  test('repeat timer re-arms and carries overshoot forward', () => {
    let timer = new Timer({duration: 100, repeat: true});

    expect(timer.update(tick(120))).toBeTruthy(); // fires, 20ms carried
    expect(timer.update(tick(80))).toBeTruthy(); // 20 + 80 = 100 -> fires again
  });

  test('fires at most once per update even across several periods', () => {
    let timer = new Timer({duration: 100, repeat: true});

    expect(timer.update(tick(350))).toBeTruthy(); // single fire, surplus carried
  });

  test('repeats getter reflects the option', () => {
    expect(new Timer({duration: 100}).repeats).toBeFalsy();
    expect(new Timer({duration: 100, repeat: true}).repeats).toBeTruthy();
  });

  test('throws a RangeError on non-positive duration', () => {
    expect(() => new Timer({duration: 0})).toThrow(RangeError);
    expect(() => new Timer({duration: -5})).toThrow('Timer duration must be > 0');
  });
});

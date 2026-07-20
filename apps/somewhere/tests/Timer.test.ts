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

    expect(timer.update(tick(350))).toBeTruthy(); // single fire; residual is 350 % 100 = 50, not 250 banked
  });

  test('sustained sub-period frames keep a bounded residual — no burst after the frame rate recovers', () => {
    let timer = new Timer({duration: 10, repeat: true});

    // 100 slow frames (35ms > the 10ms period): fires exactly once per frame,
    // and the surplus past one period is discarded instead of banked.
    for (let i = 0; i < 100; i++) {
      expect(timer.update(tick(35))).toBeTruthy();
    }

    // Frame rate recovers: with `-=` the ~2,500ms banked surplus would fire
    // every 1ms frame for seconds; drained, the next fire needs a full period.
    for (let i = 0; i < 9; i++) {
      expect(timer.update(tick(1))).toBeFalsy();
    }

    expect(timer.update(tick(1))).toBeTruthy();
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

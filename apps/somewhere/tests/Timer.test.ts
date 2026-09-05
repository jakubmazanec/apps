import type * as pixi from 'pixi.js';
import {describe, expect, test, vitest} from 'vitest';

import {defineEvent} from '../source/engine/ecs/Event.js';
import {EventChannel} from '../source/engine/ecs/EventChannel.js';
import {World} from '../source/engine/ecs/World.js';
import {Timer} from '../source/engine/scheduler/Timer.js';

const Fired = defineEvent<{value: number}>();

function tick(deltaMS: number): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

describe(Timer, () => {
  test('one-shot fires exactly once when elapsed reaches duration', () => {
    let timer = new Timer({duration: 100});

    expect(timer.update(tick(50))).toBe(false);
    expect(timer.update(tick(50))).toBe(true);
    expect(timer.update(tick(50))).toBe(false); // finished; never fires again
  });

  test('repeat timer re-arms and carries overshoot forward', () => {
    let timer = new Timer({duration: 100, repeat: true});

    expect(timer.update(tick(120))).toBe(true); // fires, 20ms carried
    expect(timer.update(tick(80))).toBe(true); // 20 + 80 = 100 -> fires again
  });

  test('fires at most once per update even across several periods', () => {
    let timer = new Timer({duration: 100, repeat: true});

    expect(timer.update(tick(350))).toBe(true); // single fire; residual is 350 % 100 = 50, not 250 banked
  });

  test('sustained sub-period frames keep a bounded residual — no burst after the frame rate recovers', () => {
    let timer = new Timer({duration: 10, repeat: true});

    // 100 slow frames (35ms > the 10ms period): fires exactly once per frame,
    // and the surplus past one period is discarded instead of banked.
    for (let i = 0; i < 100; i++) {
      expect(timer.update(tick(35))).toBe(true);
    }

    // Frame rate recovers: with `-=` the ~2,500ms banked surplus would fire
    // every 1ms frame for seconds; drained, the next fire needs a full period.
    for (let i = 0; i < 9; i++) {
      expect(timer.update(tick(1))).toBe(false);
    }

    expect(timer.update(tick(1))).toBe(true);
  });

  test('isRepeating getter reflects the option', () => {
    expect(new Timer({duration: 100}).isRepeating).toBe(false);
    expect(new Timer({duration: 100, repeat: true}).isRepeating).toBe(true);
  });

  test('throws a RangeError on non-positive duration', () => {
    expect(() => new Timer({duration: 0})).toThrow(RangeError);
    expect(() => new Timer({duration: -5})).toThrow('Timer duration must be a finite number > 0');
  });

  test('throws a RangeError on a non-finite duration', () => {
    // NaN fails every comparison, so a `duration <= 0` guard admits it: then
    // `#elapsed < NaN` is false, so the timer fires, and `#elapsed %= NaN` is
    // NaN, so a repeating one fires on every update forever. Infinity is the
    // mirror case: a timer that can never fire.
    expect(() => new Timer({duration: Number.NaN})).toThrow(RangeError);
    expect(() => new Timer({duration: Infinity})).toThrow(RangeError);
  });

  test('hook one-shot: onComplete is called once when elapsed reaches duration, not again', () => {
    let onComplete = vitest.fn<() => void>();
    let timer = new Timer({duration: 100, onComplete});

    expect(timer.update(tick(50))).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
    expect(timer.update(tick(50))).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(timer.update(tick(100))).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('hook repeat: onComplete is called once per period', () => {
    let onComplete = vitest.fn<() => void>();
    let timer = new Timer({duration: 100, repeat: true, onComplete});

    expect(timer.update(tick(120))).toBe(true);
    expect(timer.update(tick(80))).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  test('channel variant: pushes the event on its channel, seen after the swap', () => {
    let channel = new EventChannel({event: Fired, displayName: 'Fired'});

    channel.attach(new World());

    let event = new Fired({value: 7});
    let timer = new Timer({duration: 100, channel, event});

    expect(timer.update(tick(100))).toBe(true);

    expect(channel.events).toHaveLength(0);

    channel.swap();

    expect(channel.events).toHaveLength(1);
    expect(channel.events[0]).toBe(event);
  });

  test('rejects a mixed or half completion shape at compile time', () => {
    // The fixtures below exist for the @ts-expect-error assertions; the
    // constructor itself never validates the shape at runtime.
    let channel = new EventChannel({event: Fired, displayName: 'Fired'});
    let event = new Fired({value: 7});
    let onComplete = vitest.fn<() => void>();
    // @ts-expect-error -- channel and event next to onComplete is a mixed shape
    let mixed = new Timer({duration: 100, onComplete, channel, event});
    // @ts-expect-error -- a channel without its event is a half pair
    let half = new Timer({duration: 100, channel});

    expect(mixed.isRepeating).toBe(false);
    expect(half.isRepeating).toBe(false);
  });
});

import type * as pixi from 'pixi.js';
import {describe, expect, test, vitest} from 'vitest';

import {defineEvent} from '../source/engine/ecs/Event.js';
import {EventChannel} from '../source/engine/ecs/EventChannel.js';
import {World} from '../source/engine/ecs/World.js';
import {easeInQuad} from '../source/engine/scheduler/easing.js';
import {Tween} from '../source/engine/scheduler/Tween.js';

const Fired = defineEvent<{value: number}>();

function tick(deltaMS: number): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

describe(Tween, () => {
  test('captures the start value at construction and interpolates linearly', () => {
    let target = {x: 10};
    let tween = new Tween({target, to: {x: 20}, duration: 100});

    expect(tween.update(tick(50))).toBe(false);
    expect(target.x).toBeCloseTo(15);
  });

  test('reaches the end value and returns true on the completing frame', () => {
    let target = {x: 0};
    let tween = new Tween({target, to: {x: 100}, duration: 100});

    expect(tween.update(tick(100))).toBe(true);
    expect(target.x).toBeCloseTo(100);
  });

  test('clamps progress past the end (no overshoot)', () => {
    let target = {x: 0};
    let tween = new Tween({target, to: {x: 100}, duration: 100});

    expect(tween.update(tick(500))).toBe(true);
    expect(target.x).toBeCloseTo(100);
  });

  test('applies the easing function', () => {
    let target = {x: 0};
    let tween = new Tween({target, to: {x: 100}, duration: 100, easing: easeInQuad});

    tween.update(tick(50)); // progress 0.5 -> eased 0.25 -> 25

    expect(target.x).toBeCloseTo(25);
  });

  test('tweens multiple numeric fields at once', () => {
    let target = {x: 0, y: 0};
    let tween = new Tween({target, to: {x: 10, y: 20}, duration: 100});

    tween.update(tick(50));

    expect(target.x).toBeCloseTo(5);
    expect(target.y).toBeCloseTo(10);
  });

  test('duration 0 completes immediately without producing NaN', () => {
    let target = {x: 0};
    let tween = new Tween({target, to: {x: 100}, duration: 0});

    expect(tween.update(tick(0))).toBe(true);
    expect(target.x).toBe(100);
    expect(Number.isNaN(target.x)).toBe(false);
  });

  test('throws a RangeError on a non-finite or negative duration', () => {
    // NaN passes a `<= 0` guard (every comparison against NaN is false), which
    // would make progress NaN: it is written into every tweened property each
    // frame, `progress >= 1` is never true, so the Scheduler never drops the
    // entry and `onComplete` never runs. Infinity pins progress at 0 with the
    // same leak. Zero stays legal: it is the instant, non-animated transition.
    let target = {x: 0};

    expect(() => new Tween({target, to: {x: 100}, duration: Number.NaN})).toThrow(RangeError);
    expect(() => new Tween({target, to: {x: 100}, duration: Infinity})).toThrow(RangeError);
    expect(() => new Tween({target, to: {x: 100}, duration: -100})).toThrow(RangeError);
  });

  test('from is captured at construction, not at the first update (load-bearing contract)', () => {
    let target = {x: 10};
    let tween = new Tween({target, to: {x: 20}, duration: 100});

    // Mutating the target between construction and the first update must not
    // move the tween's origin: it interpolates 10 -> 20, not 999 -> 20.
    // Modal's mid-fade cancel-and-replace relies on exactly this capture
    // timing for jump-free fades (Modal.ts).
    target.x = 999;

    tween.update(tick(50));

    expect(target.x).toBeCloseTo(15);
  });

  test('hook: onComplete is called once when the tween completes', () => {
    let onComplete = vitest.fn<() => void>();
    let target = {x: 0};
    let tween = new Tween({target, to: {x: 100}, duration: 100, onComplete});

    expect(tween.update(tick(50))).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
    expect(tween.update(tick(50))).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('channel variant: pushes the event on its channel, seen after the swap', () => {
    let channel = new EventChannel({event: Fired, displayName: 'Fired'});

    channel.attach(new World());

    let event = new Fired({value: 7});
    let target = {x: 0};
    let tween = new Tween({target, to: {x: 100}, duration: 100, channel, event});

    expect(tween.update(tick(100))).toBe(true);

    expect(channel.events).toHaveLength(0);

    channel.swap();

    expect(channel.events).toHaveLength(1);
    expect(channel.events[0]).toBe(event);
  });

  test('after completion a further update returns true, keeps the end value and does not deliver again', () => {
    let onComplete = vitest.fn<() => void>();
    let target = {x: 0};
    let tween = new Tween({target, to: {x: 100}, duration: 100, onComplete});

    expect(tween.update(tick(100))).toBe(true);
    expect(tween.update(tick(100))).toBe(true);
    expect(target.x).toBeCloseTo(100);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

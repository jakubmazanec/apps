import type * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {easeInQuad} from '../source/engine/scheduler/easing.js';
import {Tween} from '../source/engine/scheduler/Tween.js';

function tick(deltaMS: number): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

describe('Tween', () => {
  test('captures the start value at construction and interpolates linearly', () => {
    let target = {x: 10};
    let tween = new Tween({target, to: {x: 20}, duration: 100});

    expect(tween.update(tick(50))).toBeFalsy();
    expect(target.x).toBeCloseTo(15);
  });

  test('reaches the end value and returns true on the completing frame', () => {
    let target = {x: 0};
    let tween = new Tween({target, to: {x: 100}, duration: 100});

    expect(tween.update(tick(100))).toBeTruthy();
    expect(target.x).toBeCloseTo(100);
  });

  test('clamps progress past the end (no overshoot)', () => {
    let target = {x: 0};
    let tween = new Tween({target, to: {x: 100}, duration: 100});

    expect(tween.update(tick(500))).toBeTruthy();
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

  test('duration <= 0 completes immediately without producing NaN', () => {
    let target = {x: 0};
    let tween = new Tween({target, to: {x: 100}, duration: 0});

    expect(tween.update(tick(0))).toBeTruthy();
    expect(target.x).toBe(100);
    expect(Number.isNaN(target.x)).toBeFalsy();
  });
});

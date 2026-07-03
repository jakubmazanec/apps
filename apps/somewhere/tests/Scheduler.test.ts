import type * as pixi from 'pixi.js';
import {describe, expect, test, vi} from 'vitest';

import {Scheduler} from '../source/engine/scheduler/Scheduler.js';

function tick(deltaMS: number): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

describe('Scheduler', () => {
  test('tween mutates the target and runs onComplete exactly once', () => {
    let scheduler = new Scheduler();
    let target = {alpha: 0};
    let onComplete = vi.fn();

    scheduler.tween({target, to: {alpha: 1}, duration: 100, onComplete});
    scheduler.update(tick(50));

    expect(target.alpha).toBeCloseTo(0.5);
    expect(onComplete).not.toHaveBeenCalled();

    scheduler.update(tick(50));

    expect(target.alpha).toBeCloseTo(1);
    expect(onComplete).toHaveBeenCalledTimes(1);

    scheduler.update(tick(50)); // entry removed; no further calls

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('after fires its callback once after the delay', () => {
    let scheduler = new Scheduler();
    let cb = vi.fn();

    scheduler.after(100, cb);
    scheduler.update(tick(100));
    scheduler.update(tick(100));

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('every keeps firing on each period', () => {
    let scheduler = new Scheduler();
    let cb = vi.fn();

    scheduler.every(100, cb);
    scheduler.update(tick(100));
    scheduler.update(tick(100));

    expect(cb).toHaveBeenCalledTimes(2);
  });

  test('a cancel handle stops a pending timer', () => {
    let scheduler = new Scheduler();
    let cb = vi.fn();

    let cancel = scheduler.after(100, cb);

    cancel();
    scheduler.update(tick(100));

    expect(cb).not.toHaveBeenCalled();
  });

  test('wait resolves {cancelled: false} when it fires', async () => {
    let scheduler = new Scheduler();
    let promise = scheduler.wait(100);

    scheduler.update(tick(100));

    await expect(promise).resolves.toEqual({cancelled: false});
  });

  test('clear() cancels everything and resolves a pending wait as cancelled', async () => {
    let scheduler = new Scheduler();
    let tweenComplete = vi.fn();
    let target = {x: 0};

    scheduler.tween({target, to: {x: 10}, duration: 100, onComplete: tweenComplete});

    let waitPromise = scheduler.wait(100);

    scheduler.clear();
    scheduler.update(tick(1000));

    expect(tweenComplete).not.toHaveBeenCalled();
    await expect(waitPromise).resolves.toEqual({cancelled: true});
  });

  test('a completion that schedules new work does not advance it in the same frame', () => {
    let scheduler = new Scheduler();
    let second = {x: 0};

    scheduler.after(100, () => {
      scheduler.tween({target: second, to: {x: 10}, duration: 100});
    });

    scheduler.update(tick(100)); // timer fires and schedules the tween; tween must NOT advance now

    expect(second.x).toBe(0);

    scheduler.update(tick(100));

    expect(second.x).toBeCloseTo(10);
  });

  test('a completion that cancels other queued work keeps it from firing the same frame', () => {
    let scheduler = new Scheduler();
    let cancelled = vi.fn();
    let cancelSecond = () => {};

    scheduler.after(100, () => {
      cancelSecond();
    });
    cancelSecond = scheduler.after(100, cancelled);

    scheduler.update(tick(100));
    scheduler.update(tick(1000));

    expect(cancelled).not.toHaveBeenCalled();
  });

  test('a completion that clears the scheduler stops the remaining snapshot entries', () => {
    let scheduler = new Scheduler();
    let cb = vi.fn();

    scheduler.tween({
      target: {x: 0},
      to: {x: 1},
      duration: 100,
      onComplete: () => {
        scheduler.clear();
      },
    });
    scheduler.after(100, cb);

    scheduler.update(tick(100));

    expect(cb).not.toHaveBeenCalled();
  });
});

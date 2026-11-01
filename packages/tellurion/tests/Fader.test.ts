import * as pixi from 'pixi.js';
import {describe, expect, test, vitest} from 'vitest';

import {Scheduler} from '../source/scheduler/Scheduler.js';
import {Fader} from '../source/ui/Fader.js';

function tick(deltaMS: number): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

function createFader() {
  let scheduler = new Scheduler();
  let view = new pixi.Container();
  let fader = new Fader({duration: 200, scheduler, view});

  return {fader, scheduler, view};
}

describe(Fader, () => {
  test('to eases the alpha and calls onComplete once, when the fade is done', () => {
    let {fader, scheduler, view} = createFader();
    let onComplete = vitest.fn<() => void>();

    view.alpha = 0;
    fader.to(1, onComplete);
    scheduler.update(tick(100));

    expect(view.alpha).toBeCloseTo(0.75); // easeOutQuad(0.5)
    expect(onComplete).not.toHaveBeenCalled();

    scheduler.update(tick(100));

    expect(view.alpha).toBe(1);
    expect(onComplete).toHaveBeenCalledTimes(1);

    scheduler.update(tick(100));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('to cancels the running fade and starts from the current alpha', () => {
    let {fader, scheduler, view} = createFader();
    let cancelled = vitest.fn<() => void>();
    let onComplete = vitest.fn<() => void>();

    view.alpha = 0;
    fader.to(1, cancelled);
    scheduler.update(tick(100));
    fader.to(0, onComplete);

    expect(view.alpha).toBeCloseTo(0.75); // no jump when the new fade starts

    scheduler.update(tick(200));

    expect(view.alpha).toBe(0);
    expect(cancelled).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('cancel stops the fade where it is and does not call onComplete', () => {
    let {fader, scheduler, view} = createFader();
    let onComplete = vitest.fn<() => void>();

    view.alpha = 0;
    fader.to(1, onComplete);
    scheduler.update(tick(100));
    fader.cancel();
    scheduler.update(tick(200));

    expect(view.alpha).toBeCloseTo(0.75);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('cancel is harmless with no fade running or after one completed', () => {
    let {fader, scheduler} = createFader();
    let onComplete = vitest.fn<() => void>();

    expect(() => {
      fader.cancel();
    }).not.toThrow();

    fader.to(1, onComplete);
    scheduler.update(tick(200));

    expect(() => {
      fader.cancel();
    }).not.toThrow();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

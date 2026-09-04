import type * as pixi from 'pixi.js';

import {Timer} from './Timer.js';
import {Tween, type TweenOptions} from './Tween.js';

// `Tween<unknown>`, not `Tween`: a `Tween<Container>` is not assignable to the default
// `Tween<Record<string, number>>` (the private `#target: T` field is checked), but it is to
// `Tween<unknown>`. `update` is the only public method and doesn't depend on `T`, so this is safe.
type TweenEntry = {tween: Tween<unknown>; onComplete?: (() => void) | undefined};
type TimerEntry = {timer: Timer; onComplete: () => void};
type WaitEntry = (result: {cancelled: boolean}) => void;

/** Owns and updates a screen's timers, tweens and waits. */
export class Scheduler {
  /** Pending timers. */
  readonly #timers = new Set<TimerEntry>();

  /** Running tweens. */
  readonly #tweens = new Set<TweenEntry>();

  /** Pending waits. */
  readonly #waits: Set<WaitEntry> = new Set();

  /** Calls `onComplete` once after `duration` milliseconds; returns a cancel function. */
  after(duration: number, onComplete: () => void): () => void {
    let entry: TimerEntry = {timer: new Timer({duration}), onComplete};

    this.#timers.add(entry);

    return () => {
      this.#timers.delete(entry);
    };
  }

  /** Clears all timers, tweens and waits. */
  clear() {
    this.#tweens.clear();
    this.#timers.clear();

    for (let resolve of this.#waits) {
      resolve({cancelled: true});
    }

    this.#waits.clear();
  }

  /** Calls `onComplete` every `duration` milliseconds; returns a cancel function. */
  every(duration: number, onComplete: () => void): () => void {
    let entry: TimerEntry = {timer: new Timer({duration, repeat: true}), onComplete};

    this.#timers.add(entry);

    return () => {
      this.#timers.delete(entry);
    };
  }

  /** Runs a tween, calling `onComplete` when it finishes; returns a cancel function. */
  tween<T>(options: TweenOptions<T> & {onComplete?: () => void}): () => void {
    let entry = {tween: new Tween(options), onComplete: options.onComplete};

    this.#tweens.add(entry);

    return () => {
      this.#tweens.delete(entry);
    };
  }

  /** @internal Called by `GameScreen` on each tick. */
  update(ticker: pixi.Ticker) {
    // Snapshot before iterating, so an `onComplete` can schedule a new tween or timer.
    let tweens = [...this.#tweens];
    let timers = [...this.#timers];

    for (let tween of tweens) {
      if (!this.#tweens.has(tween)) {
        continue;
      }

      if (tween.tween.update(ticker)) {
        tween.onComplete?.();
        this.#tweens.delete(tween);
      }
    }

    for (let timer of timers) {
      if (!this.#timers.has(timer)) {
        continue;
      }

      if (timer.timer.update(ticker)) {
        timer.onComplete();

        if (!timer.timer.isRepeating) {
          this.#timers.delete(timer);
        }
      }
    }
  }

  /** Resolves after `duration` milliseconds, or with `cancelled: true` if cleared first. */
  async wait(duration: number): Promise<{cancelled: boolean}> {
    // Track `resolve` so `clear()` can settle a pending wait; otherwise `await
    // scheduler.wait(...)` would wait forever. A cancelled wait resolves (never rejects) with
    // `{cancelled: true}`, so there isn't an unhandled rejection.
    return new Promise((resolve) => {
      this.#waits.add(resolve);
      this.after(duration, () => {
        this.#waits.delete(resolve);
        resolve({cancelled: false});
      });
    });
  }
}

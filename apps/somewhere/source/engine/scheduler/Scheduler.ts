import type * as pixi from 'pixi.js';

import {Timer} from './Timer.js';
import {Tween, type TweenOptions} from './Tween.js';

type WaitEntry = (result: {cancelled: boolean}) => void;

/** Owns and updates a screen's timers, tweens and waits. */
export class Scheduler {
  /** Pending timers. */
  readonly #timers = new Set<Timer>();

  /** Pending tweens. */
  readonly #tweens = new Set<Tween<unknown>>();

  /** Pending waits. */
  readonly #waits: Set<WaitEntry> = new Set();

  /** Calls `onComplete` once after `duration` milliseconds; returns a cancel function. */
  after(duration: number, onComplete: () => void): () => void {
    let timer = new Timer({duration, onComplete});

    this.#timers.add(timer);

    return () => {
      this.#timers.delete(timer);
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
    let timer = new Timer({duration, repeat: true, onComplete});

    this.#timers.add(timer);

    return () => {
      this.#timers.delete(timer);
    };
  }

  /**
   * Runs a tween, which delivers its own completion when it finishes; returns a cancel function.
   */
  tween<T>(options: TweenOptions<T>): () => void {
    let tween = new Tween(options);

    this.#tweens.add(tween);

    return () => {
      this.#tweens.delete(tween);
    };
  }

  /** @internal Called by `GameScreen` on each tick. */
  update(ticker: pixi.Ticker) {
    // Snapshot before iterating, so a completion can schedule a new tween or timer.
    let tweens = [...this.#tweens];
    let timers = [...this.#timers];

    for (let tween of tweens) {
      if (this.#tweens.has(tween) && tween.update(ticker)) {
        this.#tweens.delete(tween);
      }
    }

    for (let timer of timers) {
      if (this.#timers.has(timer) && timer.update(ticker) && !timer.isRepeating) {
        this.#timers.delete(timer);
      }
    }
  }

  // TODO: is this needed? Weird API, investigate.
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

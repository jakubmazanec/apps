import type * as pixi from 'pixi.js';

import {Timer} from './Timer.js';
import {Tween, type TweenOptions} from './Tween.js';

// `Tween<unknown>`, not `Tween`: a `Tween<Container>` is not assignable to the default
// `Tween<Record<string, number>>` (the private `#target: T` field is checked), but it is to
// `Tween<unknown>`. `update` is the only public method and doesn't depend on `T`, so this is safe.
type TweenEntry = {tween: Tween<unknown>; onComplete?: (() => void) | undefined};
type TimerEntry = {timer: Timer; onComplete: () => void};

export class Scheduler {
  readonly #tweens = new Set<TweenEntry>();
  readonly #timers = new Set<TimerEntry>();
  readonly #pendingWaits = new Set<(result: {cancelled: boolean}) => void>();

  /** @internal Called by `GameScreen.update`. */
  update(ticker: pixi.Ticker) {
    // Snapshot before iterating: an `onComplete` may schedule a new tween/timer (a fade-out that
    // starts a fade-in). Iterating the live `Set` would visit that fresh entry in the same pass and
    // advance it by this same frame's `deltaMS`; snapshotting makes scheduled-from-completion work
    // start next frame, as intended. (The copy is deliberate — do not iterate the live Set.)
    let tweenEntries = [...this.#tweens];
    let timerEntries = [...this.#timers];

    for (let entry of tweenEntries) {
      if (!this.#tweens.has(entry)) {
        continue;
      }

      if (entry.tween.update(ticker)) {
        entry.onComplete?.();
        this.#tweens.delete(entry);
      }
    }

    for (let entry of timerEntries) {
      if (!this.#timers.has(entry)) {
        continue;
      }

      if (entry.timer.update(ticker)) {
        entry.onComplete();

        if (!entry.timer.repeats) {
          this.#timers.delete(entry);
        }
      }
    }
  }

  tween<T>(options: TweenOptions<T> & {onComplete?: () => void}): () => void {
    let entry: TweenEntry = {tween: new Tween(options), onComplete: options.onComplete};

    this.#tweens.add(entry);

    return () => this.#tweens.delete(entry);
  }

  after(duration: number, onComplete: () => void): () => void {
    let entry: TimerEntry = {timer: new Timer({duration}), onComplete};

    this.#timers.add(entry);

    return () => this.#timers.delete(entry);
  }

  every(duration: number, onComplete: () => void): () => void {
    let entry: TimerEntry = {timer: new Timer({duration, repeat: true}), onComplete};

    this.#timers.add(entry);

    return () => this.#timers.delete(entry);
  }

  wait(duration: number): Promise<{cancelled: boolean}> {
    // Track `resolve` so `clear()` can settle a pending wait; otherwise dropping the timer would
    // leave `await scheduler.wait(...)` suspended forever. A cancelled wait resolves (never
    // rejects) with `{cancelled: true}`, so a fire-and-forget `wait()` cannot become an unhandled
    // rejection when the screen hides.
    return new Promise((resolve) => {
      this.#pendingWaits.add(resolve);
      this.after(duration, () => {
        this.#pendingWaits.delete(resolve);
        resolve({cancelled: false});
      });
    });
  }

  clear() {
    this.#tweens.clear();
    this.#timers.clear();

    for (let resolve of this.#pendingWaits) {
      resolve({cancelled: true});
    }

    this.#pendingWaits.clear();
  }
}

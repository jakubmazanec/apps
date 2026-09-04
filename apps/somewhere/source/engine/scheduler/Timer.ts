import type * as pixi from 'pixi.js';

import {type Event} from '../ecs/Event.js';
import {type EventChannel} from '../ecs/EventChannel.js';

export type TimerOptions = {
  duration: number; // milliseconds
  repeat?: boolean | undefined;
} & (
  | {channel: EventChannel; event: Event; onComplete?: never}
  | {channel?: never; event?: never; onComplete?: (() => void) | undefined}
);

/** Counts down a duration, once or repeatedly. */
export class Timer {
  /** Completes the timer.  */
  readonly #complete: () => void;

  /** Duration in milliseconds. */
  readonly #duration: number;

  /** Elapsed milliseconds. */
  #elapsed = 0;

  /** Set once a non-repeating timer completes. */
  #isCompleted = false;

  /** Whether the timer restarts after completing. */
  readonly #isRepeating: boolean;

  constructor(options: TimerOptions) {
    if (!Number.isFinite(options.duration) || options.duration <= 0) {
      throw new RangeError('Timer duration must be a finite number > 0');
    }

    this.#duration = options.duration;
    this.#isRepeating = options.repeat ?? false;
    // `'channel' in options` would not narrow here: both members declare the prop.
    this.#complete =
      options.channel === undefined ?
        (options.onComplete ?? (() => {}))
      : () => options.channel.push(options.event);
  }

  /** Does the timer restart after completing? */
  get isRepeating(): boolean {
    return this.#isRepeating;
  }

  /**
   * Advances the timer on each tick. Delivers the completion and returns true when it fires; a
   * finished one-shot returns false from then on.
   */
  update(ticker: pixi.Ticker): boolean {
    if (this.#isCompleted) {
      return false;
    }

    this.#elapsed += ticker.deltaMS;

    if (this.#elapsed < this.#duration) {
      return false;
    }

    // State first, then delivery: a hook that throws must not re-fire on the next tick.
    if (this.#isRepeating) {
      this.#elapsed %= this.#duration;
    } else {
      this.#isCompleted = true;
    }

    this.#complete();

    return true;
  }
}

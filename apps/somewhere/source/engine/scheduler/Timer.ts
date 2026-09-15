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

  /** Is the timer completed? A repeating timer never completes. */
  #isCompleted = false;

  /** Does the timer restart after completing? */
  readonly #isRepeating: boolean;

  constructor(options: TimerOptions) {
    if (!Number.isFinite(options.duration) || options.duration <= 0) {
      throw new RangeError('Timer duration must be a finite number > 0');
    }

    this.#duration = options.duration;
    this.#isRepeating = options.repeat ?? false;
    this.#complete =
      options.channel === undefined ?
        (options.onComplete ?? (() => {}))
      : () => options.channel.push(options.event);
  }

  /** Is the timer completed? A repeating timer never completes. */
  get isCompleted(): boolean {
    return this.#isCompleted;
  }

  /** Does the timer restart after completing? */
  get isRepeating(): boolean {
    return this.#isRepeating;
  }

  /**
   * Advances the timer on each tick and delivers the completion.
   */
  update(ticker: pixi.Ticker) {
    if (this.#isCompleted) {
      return;
    }

    this.#elapsed += ticker.deltaMS;

    if (this.#elapsed < this.#duration) {
      return;
    }

    if (this.#isRepeating) {
      this.#elapsed %= this.#duration;
    } else {
      this.#isCompleted = true;
    }

    this.#complete();
  }
}

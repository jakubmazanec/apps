import type * as pixi from 'pixi.js';

export type TimerOptions = {
  duration: number; // milliseconds
  repeat?: boolean | undefined;
};

/** Counts down a duration , once or repeatedly. */
export class Timer {
  /** Duration in milliseconds. */
  readonly #duration: number;

  /** Elapsed milliseconds. */
  #elapsed = 0;

  /** Set once a non-repeating timer completes. */
  #isFinished = false;

  /** Whether the timer restarts after completing. */
  readonly #isRepeating: boolean;

  constructor({duration, repeat = false}: TimerOptions) {
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new RangeError('Timer duration must be a finite number > 0');
    }

    this.#duration = duration;
    this.#isRepeating = repeat;
  }

  /** Does the timer restart after completing? */
  get isRepeating(): boolean {
    return this.#isRepeating;
  }

  /** Advances the timer on each tick. */
  update(ticker: pixi.Ticker): boolean {
    if (this.#isFinished) {
      return false;
    }

    this.#elapsed += ticker.deltaMS;

    if (this.#elapsed < this.#duration) {
      return false;
    }

    if (this.#isRepeating) {
      this.#elapsed %= this.#duration;
    } else {
      this.#isFinished = true;
    }

    return true;
  }
}

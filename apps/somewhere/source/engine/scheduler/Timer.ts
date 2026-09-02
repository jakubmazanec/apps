import type * as pixi from 'pixi.js';

export type TimerOptions = {
  duration: number; // milliseconds
  repeat?: boolean | undefined;
};

export class Timer {
  /** TBD */
  readonly #duration: number;

  /** TBD */
  #elapsed = 0;

  /** TBD */
  #isFinished = false;

  /** TBD */
  readonly #isRepeating: boolean;

  constructor({duration, repeat = false}: TimerOptions) {
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new RangeError('Timer duration must be a finite number > 0');
    }

    this.#duration = duration;
    this.#isRepeating = repeat;
  }

  /** TBD */
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

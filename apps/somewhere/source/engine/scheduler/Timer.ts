import type * as pixi from 'pixi.js';

export type TimerOptions = {
  duration: number; // milliseconds
  repeat?: boolean;
};

export class Timer {
  readonly #duration: number;
  readonly #repeat: boolean;
  #elapsed = 0;
  #finished = false;

  constructor({duration, repeat = false}: TimerOptions) {
    // Guard `duration <= 0`: a non-positive period fires every frame (a `repeat` timer would
    // `#elapsed -= 0` and re-arm instantly), so reject it as a programmer error at construction.
    if (duration <= 0) {
      throw new RangeError('Timer duration must be > 0');
    }

    this.#duration = duration;
    this.#repeat = repeat;
  }

  get repeats(): boolean {
    return this.#repeat;
  }

  /** Advance by the ticker's `deltaMS`; returns `true` if it fired this call (at most once, even across several periods). */
  update(ticker: pixi.Ticker): boolean {
    if (this.#finished) {
      return false;
    }

    this.#elapsed += ticker.deltaMS;

    if (this.#elapsed < this.#duration) {
      return false;
    }

    if (this.#repeat) {
      this.#elapsed -= this.#duration;
    } else {
      this.#finished = true;
    }

    return true;
  }
}

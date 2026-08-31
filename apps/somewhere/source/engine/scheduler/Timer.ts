import type * as pixi from 'pixi.js';

export type TimerOptions = {
  duration: number; // milliseconds
  repeat?: boolean;
};

export class Timer {
  /** TBD */
  readonly #duration: number;

  /** TBD */
  #elapsed = 0;

  /** TBD */
  #finished = false;

  /** TBD */
  readonly #repeat: boolean;

  constructor({duration, repeat = false}: TimerOptions) {
    // Guard `duration <= 0`: a non-positive period fires every frame (a `repeat` timer's
    // `#elapsed %= 0` yields NaN, and `NaN < duration` is false, so every update fires), so
    // reject it as a programmer error at construction. The finite check carries the same
    // guarantee for a NaN duration, which passes `<= 0` (every comparison against NaN is
    // false) and reaches the identical every-frame failure; it also rejects Infinity, which
    // builds a timer that can never fire.
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new RangeError('Timer duration must be a finite number > 0');
    }

    this.#duration = duration;
    this.#repeat = repeat;
  }

  /** TBD */
  get repeats(): boolean {
    return this.#repeat;
  }

  /** Advances the timer on each tick. */
  update(ticker: pixi.Ticker): boolean {
    if (this.#finished) {
      return false;
    }

    this.#elapsed += ticker.deltaMS;

    if (this.#elapsed < this.#duration) {
      return false;
    }

    if (this.#repeat) {
      // Drain the whole surplus, not one period: under sustained sub-period
      // frames `-=` banks time without bound, then fires every frame until
      // the surplus drains once the frame rate recovers. `%=` keeps the
      // residual below one period — effective cadence max(period, frame
      // time), phase realigned after a hitch.
      this.#elapsed %= this.#duration;
    } else {
      this.#finished = true;
    }

    return true;
  }
}

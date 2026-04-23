import type * as pixi from 'pixi.js';

import {type Easing, linear} from './easing.js';

// Real targets (a Pixi `Container`, an `ObservablePoint`, a `Vector`) are class instances with
// methods, so they do NOT satisfy `Record<string, number>`. Leave `target` loose and constrain
// only `to` to the target's numeric-valued keys.
type NumericKeys<T> = {[K in keyof T]: T[K] extends number ? K : never}[keyof T];

export type TweenOptions<T> = {
  target: T;
  to: Partial<Pick<T, NumericKeys<T>>>;
  duration: number; // milliseconds, >= 0 (0 completes on the first update)
  easing?: Easing;
};

/**
 * Interpolates the numeric properties named in `to` from their current values
 * toward the target values over `duration` milliseconds.
 *
 * Axiom: `from` is captured at construction, NOT at the first update —
 * construct a tween at the moment it should start. This is load-bearing:
 * cancel-and-replace flows (e.g. Modal's mid-fade close) rely on a new tween
 * picking up from the target's current value with no visual jump.
 */
export class Tween<T = Record<string, number>> {
  /** TBD */
  readonly #duration: number;

  /** TBD */
  readonly #easing: Easing;

  /** TBD */
  #elapsed = 0;

  /** TBD */
  readonly #from: Partial<Record<NumericKeys<T>, number>> = {};

  /** TBD */
  readonly #target: T;

  /** TBD */
  readonly #to: Partial<Pick<T, NumericKeys<T>>>;

  constructor({target, to, duration, easing = linear}: TweenOptions<T>) {
    // `< 0` rather than `<= 0`: a zero duration is legal and completes on the first
    // update (see `update`), which is how an instant, non-animated transition is spelled.
    // The finite check is what rejects NaN, which passes any `<` or `<=` comparison and
    // would otherwise make progress NaN: poisoned target properties every frame, and
    // `progress >= 1` never true, so the Scheduler holds the entry forever. Infinity pins
    // progress at 0 with the same leak.
    if (!Number.isFinite(duration) || duration < 0) {
      throw new RangeError('Tween duration must be a finite number >= 0');
    }

    this.#target = target;
    this.#to = to;
    this.#duration = duration;
    this.#easing = easing;

    let source = target as Record<NumericKeys<T>, number>;

    for (let key of Object.keys(to) as Array<NumericKeys<T>>) {
      this.#from[key] = source[key];
    }
  }

  /** Advance by the ticker's `deltaMS`; returns `true` on the frame it reaches the end. */
  update(ticker: pixi.Ticker): boolean {
    this.#elapsed += ticker.deltaMS;

    // Guard `duration <= 0`: without it a zero-delta tick yields 0/0 = NaN and poisons the target.
    let progress = this.#duration <= 0 ? 1 : Math.min(this.#elapsed / this.#duration, 1);
    let eased = this.#easing(progress);
    let target = this.#target as Record<NumericKeys<T>, number>;
    let to = this.#to as Partial<Record<NumericKeys<T>, number>>;

    for (let key of Object.keys(to) as Array<NumericKeys<T>>) {
      let from = this.#from[key]!;

      target[key] = from + (to[key]! - from) * eased;
    }

    return progress >= 1;
  }
}

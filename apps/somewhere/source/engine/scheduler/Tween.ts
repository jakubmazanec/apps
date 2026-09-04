import type * as pixi from 'pixi.js';

import {type Event} from '../ecs/Event.js';
import {type EventChannel} from '../ecs/EventChannel.js';
import {type Easing, linear} from './easing.js';

// We can tween only numeric keys.
type NumericKeys<T> = {[K in keyof T]: T[K] extends number ? K : never}[keyof T];

export type TweenOptions<T> = {
  target: T;
  to: Partial<Pick<T, NumericKeys<T>>>;
  duration: number; // milliseconds, >= 0 (0 completes on the first update)
  easing?: Easing | undefined;
} & (
  | {channel: EventChannel; event: Event; onComplete?: never}
  | {channel?: never; event?: never; onComplete?: (() => void) | undefined}
);

/**
 * Interpolates the numeric properties from their values at construction time to
 * the target values over time.
 */
export class Tween<T = Record<string, number>> {
  /**
   * Delivers the completion: calls the hook, or pushes the event on its channel (seen next frame).
   */
  readonly #complete: () => void;

  /** Duration in milliseconds. */
  readonly #duration: number;

  /** Easing function. */
  readonly #easing: Easing;

  /** Elapsed milliseconds. */
  #elapsed = 0;

  /** Starting values. */
  readonly #from: Partial<Record<NumericKeys<T>, number>> = {};

  /** Set once the completion has been delivered. */
  #isCompleted = false;

  /** Object whose properties are interpolated. */
  readonly #target: T;

  /** End values. */
  readonly #to: Partial<Pick<T, NumericKeys<T>>>;

  constructor(options: TweenOptions<T>) {
    if (!Number.isFinite(options.duration) || options.duration < 0) {
      throw new RangeError('Tween duration must be a finite number >= 0');
    }

    this.#target = options.target;
    this.#to = options.to;
    this.#duration = options.duration;
    this.#easing = options.easing ?? linear;
    this.#complete =
      options.channel === undefined ?
        (options.onComplete ?? (() => {}))
      : () => options.channel.push(options.event);

    let source = options.target as Record<NumericKeys<T>, number>;

    for (let key of Object.keys(options.to) as Array<NumericKeys<T>>) {
      this.#from[key] = source[key];
    }
  }

  /**
   * Advances the tween on each tick; delivers the completion once and returns true from then on.
   */
  update(ticker: pixi.Ticker): boolean {
    this.#elapsed += ticker.deltaMS;

    // Guard `duration <= 0`: without it a zero-delta tick yields 0/0 = NaN and poisons the target.
    let progress = this.#duration <= 0 ? 1 : Math.min(this.#elapsed / this.#duration, 1);
    let eased = this.#easing(progress);
    let target = this.#target as Record<NumericKeys<T>, number>;
    let to = this.#to as Partial<Record<NumericKeys<T>, number>>;

    for (let key of Object.keys(to) as Array<NumericKeys<T>>) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- iterating on existing keys
      let from = this.#from[key]!;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- iterating on existing keys
      target[key] = from + (to[key]! - from) * eased;
    }

    if (progress < 1) {
      return false;
    }

    // At most once: the class guarantees single delivery, not each owner.
    if (!this.#isCompleted) {
      this.#isCompleted = true;
      this.#complete();
    }

    return true;
  }
}

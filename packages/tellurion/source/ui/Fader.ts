import {easeOutQuad} from '../scheduler/easing.js';
import {type FaderConfig} from './FaderConfig.js';
import {type FaderOptions} from './FaderOptions.js';
import {type FaderRuntime} from './FaderRuntime.js';

/** Fades the alpha of a view on a scheduler. */
export class Fader {
  /** Object for storing config. */
  readonly #config: FaderConfig;

  /** Object for internal values that may change. */
  readonly #runtime: FaderRuntime = {};

  constructor({duration, scheduler, view}: FaderOptions) {
    this.#config = {duration, scheduler, view};
  }

  /** Cancels the running fade; the alpha stays where it is and `onComplete` is not called. */
  cancel(): void {
    this.#runtime.cancelFade?.();
  }

  /** Fades the view to `alpha`, cancelling the running fade, then calls `onComplete`. */
  to(alpha: number, onComplete: () => void): void {
    this.cancel();

    let {duration, scheduler, view} = this.#config;

    this.#runtime.cancelFade = scheduler.tween({
      target: view,
      to: {alpha},
      duration,
      easing: easeOutQuad,
      onComplete,
    });
  }
}

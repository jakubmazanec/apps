import {type Slider} from './Slider.js';
import {type SliderBackgrounds} from './SliderBackgrounds.js';
import {type ThemedOptions} from './UiTheme.js';

export type SliderOptions = ThemedOptions<SliderBackgrounds> & {
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  value?: number | undefined;
  // Fires on every value change, including each pointermove tick of a drag
  // and each keyboard increase()/decrease() step. Slider has no notion of a
  // separate "finalized" change to report — a consumer that only cares about
  // the settled value (e.g. debouncing a slow write) owns that distinction
  // itself, by debouncing onChange in userland.
  onChange?: ((slider: Slider) => void) | undefined;
};

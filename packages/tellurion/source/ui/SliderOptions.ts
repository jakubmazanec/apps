import {type Slider} from './Slider.js';
import {type UiComponentThemeOptions} from './UiTheme.js';

export type SliderOptions = UiComponentThemeOptions<'slider'> & {
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

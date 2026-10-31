import {type Slider} from './Slider.js';
import {type UiComponentThemeOptions} from './UiTheme.js';

export type SliderOptions = UiComponentThemeOptions<'slider'> & {
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  value?: number | undefined;
  onChange?: ((slider: Slider) => void) | undefined;
};

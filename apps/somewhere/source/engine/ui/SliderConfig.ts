import {type Config} from '../utilities/Config.js';
import {type UiTheme} from './UiTheme.js';

export type SliderConfig = Config<{
  max: number;
  min: number;
  step: number;
  theme: UiTheme | undefined;
  trackHeight: number;
  trackWidth: number;
}>;

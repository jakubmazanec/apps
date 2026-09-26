import {type Config} from '../utilities/Config.js';
import {type ResolvedUiTheme} from './UiTheme.js';

export type SliderConfig = Config<{
  max: number;
  min: number;
  step: number;
  theme: ResolvedUiTheme | undefined;
  trackHeight: number;
  trackWidth: number;
}>;

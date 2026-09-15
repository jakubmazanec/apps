import {type Config} from '../utilities/Config.js';
import {type UiTheme} from './UiTheme.js';

export type ButtonConfig = Config<{
  /** Padding captured at construction; press/release restores it. */
  basePadding: {readonly bottom: number; readonly top: number};
  layout: NonNullable<UiTheme['button']['layout']>;
  pressOffset: number;
  theme: UiTheme | undefined;
}>;

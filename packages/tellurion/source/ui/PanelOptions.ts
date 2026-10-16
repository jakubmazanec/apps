import {type UiChild} from './UiChild.js';
import {type UiComponentThemeOptions} from './UiTheme.js';

export type PanelOptions = UiComponentThemeOptions<'panel'> & {
  children?: UiChild[] | undefined;
};

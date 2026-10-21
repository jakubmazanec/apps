import {type UiChildComponent} from './UiChildComponent.js';
import {type UiComponentThemeOptions} from './UiTheme.js';

export type PanelOptions = UiComponentThemeOptions<'panel'> & {
  children?: UiChildComponent[] | undefined;
};

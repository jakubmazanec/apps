import {type ChildUiComponent} from './ChildUiComponent.js';
import {type UiComponentThemeOptions} from './UiTheme.js';

export type PanelOptions = UiComponentThemeOptions<'panel'> & {
  children?: ChildUiComponent[] | undefined;
};

import type * as pixi from 'pixi.js';

export type UiTextStyle = {
  fontFamily: string;
  fontSize: number;
  fill: pixi.ColorSource;
};

// One shape, two instantiations: the description names atlas frames and is safe
// to evaluate at module load; the resolved theme holds textures and only exists
// after the default bundle has loaded.
// Widget groups may also carry layout defaults (plain data, identical in both
// instantiations); a widget merges them under its own options, so an instance
// property wins per property.
export type UiThemeOf<T> = {
  button: {
    normal: T;
    hovered: T;
    active: T;
    disabled: T;
    layout?: Exclude<pixi.ContainerOptions['layout'], boolean | undefined>;
    pressOffset?: number;
  };
  textInput: {normal: T; hovered: T; disabled: T};
  slider: {track: T; fill: T; hovered: T; disabled: T};
  toggle: {
    unchecked: T;
    checked: T;
    hovered: T;
    hoveredChecked: T;
    disabled: T;
    disabledChecked: T;
  };
  panel: {background: T};
  focusRing: {texture: T; padding: number};
  text: {label: UiTextStyle; body: UiTextStyle};
};

export type UiThemeDescription = UiThemeOf<readonly [spriteset: string, frame: string]>;
export type UiTheme = UiThemeOf<pixi.Texture>;

// Widgets take a theme or explicit backgrounds, never neither. Explicit
// backgrounds win per state, so a caller can override one state and take the
// rest from the theme.
export type ThemedOptions<Backgrounds> =
  | {theme: UiTheme; backgrounds?: Partial<Backgrounds>}
  | {theme?: undefined; backgrounds: Backgrounds};

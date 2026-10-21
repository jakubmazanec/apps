// TODO: split this file, move some types to own files
import {type Simplify} from '@jakubmazanec/ts-utils';
import {type LayoutStyles} from '@pixi/layout';
import type * as pixi from 'pixi.js';

import {type Opaque} from '../utilities/Opaque.js';

export type UiTextStyle = {
  fontFamily: string;
  fontSize: number;
  fill: pixi.ColorSource;
};

/** UI theme object; keys are component themes that are used by the UI components. */
export type UiTheme<Background> = {
  button: {
    normal: Background;
    hovered: Background;
    active: Background;
    disabled: Background;
    layout?: LayoutStyles;
    pressOffset?: number;
  };
  textInput: {
    normal: Background;
    hovered: Background;
    disabled: Background;
    layout?: LayoutStyles;
  };
  slider: {track: Background; fill: Background; hovered: Background; disabled: Background};
  toggle: {
    unchecked: Background;
    checked: Background;
    hovered: Background;
    hoveredChecked: Background;
    disabled: Background;
    disabledChecked: Background;
  };
  panel: {
    background: Background;
    layout?: LayoutStyles;
  };
  modal: {
    scrimColor: number | string;
    scrimAlpha: number;
  };
  focusRing: {
    texture: Background;
    padding: number;
  };
  text: {
    label: UiTextStyle;
    body: UiTextStyle;
  };
};

/** UI theme object used for the UI theme description. */
export type UiThemeDescription = UiTheme<readonly [spriteset: string, frame: string]>;

/** UI theme object used for the resolved UI theme; instead of desciptions, object has textures. */
export type ResolvedUiTheme = UiTheme<pixi.Texture>;

/** A helper type. */
type Slot = Opaque<unknown, 'Slot'>;

/** UI theme object used as a helper type. */
type UiThemeWithSlot = UiTheme<Slot>;

/** Helper type that specifies which backgrounds a component has. */
type UiThemeComponentBackgroundKeys<Component extends keyof UiThemeWithSlot> = {
  [Key in keyof UiThemeWithSlot[Component]]-?: UiThemeWithSlot[Component][Key] extends Slot ? Key
  : never;
}[keyof UiThemeWithSlot[Component]];

/** Component, i.e. key of the theme type, that have at least one background in its theme. */
type ComponentWithBackground = {
  [Component in keyof UiThemeWithSlot]: [UiThemeComponentBackgroundKeys<Component>] extends (
    [never]
  ) ?
    never
  : Component;
}[keyof UiThemeWithSlot];

/** Helper type that specifies available options for a component. */
export type UiComponentThemeOptions<Component extends keyof UiThemeWithSlot> = Simplify<{
  [Key in Exclude<keyof UiThemeWithSlot[Component], UiThemeComponentBackgroundKeys<Component>>]?:
    UiThemeWithSlot[Component][Key] | undefined;
}> &
  (Component extends ComponentWithBackground ?
    | {
        theme: ResolvedUiTheme;
        backgrounds?: Partial<
          Simplify<Record<UiThemeComponentBackgroundKeys<Component>, pixi.Container>>
        >;
      }
    | {
        theme?: undefined;
        backgrounds: Simplify<Record<UiThemeComponentBackgroundKeys<Component>, pixi.Container>>;
      }
  : {theme?: ResolvedUiTheme | undefined});

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

// One shape, two instantiations: the description names atlas frames and is safe
// to evaluate at module load; the resolved theme holds textures and only exists
// after the default bundle has loaded.
// Widget groups may also carry layout defaults (plain data, identical in both
// instantiations); a widget merges them under its own options, so an instance
// property wins per property.
/** TBD... keys are Components, to be used by UiComponents... */
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
  focusRing: {
    texture: Background;
    padding: number;
  };
  text: {
    label: UiTextStyle;
    body: UiTextStyle;
  };
};

export type UiThemeDescription = UiTheme<readonly [spriteset: string, frame: string]>;
export type ResolvedUiTheme = UiTheme<pixi.Texture>;

type Slot = Opaque<unknown, 'Slot'>;
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
export type UiComponentThemeOptions<Component extends ComponentWithBackground> = Simplify<{
  [Key in Exclude<keyof UiThemeWithSlot[Component], UiThemeComponentBackgroundKeys<Component>>]?:
    UiThemeWithSlot[Component][Key] | undefined;
}> &
  (
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
  );

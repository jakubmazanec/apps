import {type LayoutStyles} from '@pixi/layout';
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
    layout?: LayoutStyles;
    // Pixels to shift the content down while pressed, so the label tracks a
    // background whose face drops on press (e.g. an extruded 3D button).
    pressOffset?: number;
  };
  textInput: {normal: T; hovered: T; disabled: T; layout?: LayoutStyles};
  slider: {track: T; fill: T; hovered: T; disabled: T};
  toggle: {
    unchecked: T;
    checked: T;
    hovered: T;
    hoveredChecked: T;
    disabled: T;
    disabledChecked: T;
  };
  panel: {background: T; layout?: LayoutStyles};
  focusRing: {texture: T; padding: number};
  text: {label: UiTextStyle; body: UiTextStyle};
};

export type UiThemeDescription = UiThemeOf<readonly [spriteset: string, frame: string]>;
export type UiTheme = UiThemeOf<pixi.Texture>;

declare const artSlot: unique symbol;

// Probe type: instantiating UiThemeOf with it marks every art slot, so the
// helpers below can tell art apart from the plain-data defaults sitting in the
// same group.
type ArtSlot = {[artSlot]: true};

type ProbedTheme = UiThemeOf<ArtSlot>;

type ArtKeys<Group extends keyof ProbedTheme> = {
  [Key in keyof ProbedTheme[Group]]-?: ProbedTheme[Group][Key] extends ArtSlot ? Key : never;
}[keyof ProbedTheme[Group]];

// Groups that dress a widget: the ones with at least one art slot.
type UiWidgetGroup = {
  [Group in keyof ProbedTheme]: [ArtKeys<Group>] extends [never] ? never : Group;
}[keyof ProbedTheme];

// Mapped types display as an unreadable intersection without this.
type Flatten<T> = {[Key in keyof T]: T[Key]} & {};

// Widgets take a theme or explicit backgrounds, never neither. Explicit
// backgrounds win per slot, so a caller with a theme can override one slot and
// take the rest from it; a caller without a theme supplies every slot the theme
// would have.
// Beyond the art, each of the group's plain-data defaults becomes an instance
// level override — declaring one in UiThemeOf is the whole change needed for the
// matching widget to accept it.
export type UiComponentThemeOptions<Group extends UiWidgetGroup> = Flatten<{
  [Key in Exclude<keyof ProbedTheme[Group], ArtKeys<Group>>]?: ProbedTheme[Group][Key] | undefined;
}> &
  (
    | {theme: UiTheme; backgrounds?: Partial<Flatten<Record<ArtKeys<Group>, pixi.Container>>>}
    | {theme?: undefined; backgrounds: Flatten<Record<ArtKeys<Group>, pixi.Container>>}
  );

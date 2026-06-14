import type * as pixi from 'pixi.js';

export type Focusable = {
  readonly view: pixi.Container;
  // False while the component cannot take focus (it is disabled).
  readonly isFocusable: boolean;
  // The component's Enter/Space action: what a click/tap would do.
  activate: () => void;
};

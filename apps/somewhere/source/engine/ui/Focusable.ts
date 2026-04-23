import type * as pixi from 'pixi.js';

export type Focusable = {
  readonly view: pixi.Container;
  // False while the component cannot take focus (it is disabled).
  readonly isFocusable: boolean;
  // The component's Enter/Space action: what a click/tap would do.
  activate: () => void;
  // Equal/PageUp and Minus/PageDown while focused. Optional: a component with
  // no incremental value (Button, Toggle, TextInput) omits them, because
  // Enter/Space (activate) already owns its one action. Slider is the only
  // implementer that does real work here.
  increase?: () => void;
  decrease?: () => void;
};

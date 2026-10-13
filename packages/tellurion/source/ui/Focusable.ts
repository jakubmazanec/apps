import type * as pixi from 'pixi.js';

export type Focusable = {
  /** View. */
  readonly view: pixi.Container;

  /** Can the component be focused? E.g. disabled components aren't focusable. */
  readonly isFocusable: boolean;

  /** Executes component's primary semantic action; usually what click or tap would do. */
  // The component's Enter/Space action: what a click/tap would do.
  activate: () => void;

  /** Executes component's increase action. */
  increase?: () => void;

  /** Executes component's decrease action. */
  decrease?: () => void;

  /** Ends what activation started. */
  deactivate?: () => void;
};

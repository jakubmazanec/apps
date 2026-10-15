import type * as pixi from 'pixi.js';

/** A component that can be focused. */
export type Focusable = {
  /** View. */
  readonly view: pixi.Container;

  /** Can the component be focused? E.g. disabled components aren't focusable. */
  readonly isFocusable: boolean;

  /** Executes component's primary semantic action; usually what click or tap would do. */
  activate: () => void;

  /** Executes component's increase action. */
  increase?: () => void;

  /** Executes component's decrease action. */
  decrease?: () => void;

  /** Ends what activation started. */
  deactivate?: () => void;
};

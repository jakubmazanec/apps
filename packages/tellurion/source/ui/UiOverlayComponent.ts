import {type Focusable} from './Focusable.js';
import {type UiParentComponent} from './UiParentComponent.js';
import {type UiRoot} from './UiRoot.js';

/**
 * A component that is also an overlay. UiOverlayComponent holds the focus scope while it is
 * attached.
 */
export type UiOverlayComponent = UiParentComponent & {
  /** Attaches the overlay to an UI root. */
  attach?: (ui: UiRoot) => void;

  /** Dissmisses the overlay. */
  close?: () => void;

  /** Dettaches the overlay. */
  detach?: () => void;

  /** A child component that takes the initial focus. */
  readonly initialFocus?: Focusable | undefined;
};

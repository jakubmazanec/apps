import {type FocusableUiComponent} from './FocusableUiComponent.js';
import {type ParentUiComponent} from './ParentUiComponent.js';
import {type UiRoot} from './UiRoot.js';

/**
 * A component that is also an overlay. OverlayUiComponent holds the focus scope while it is
 * attached.
 */
export type OverlayUiComponent = ParentUiComponent & {
  /** Attaches the overlay to an UI root. */
  attach?: (ui: UiRoot) => void;

  /** Dismisses the overlay. */
  close?: () => void;

  /** Detaches the overlay. */
  detach?: () => void;

  /** A child component that takes the initial focus. */
  readonly initialFocus?: FocusableUiComponent | undefined;
};

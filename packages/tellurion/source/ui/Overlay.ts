import {type Focusable} from './Focusable.js';
import {type UiParent} from './UiChild.js';
import {type UiRoot} from './UiRoot.js';

// A component attached to a UiRoot as an overlay. Every overlay holds the
// focus scope while it is attached, so focus discovery cannot leave it; a
// component shown on top that must not trap focus is a plain child. UiRoot
// calls attach right after the overlay got its scope and detach right after it
// left the tree; nothing else calls them, and an overlay with nothing to do
// there omits them. Declaring `close` is what makes the cancel command dismiss
// it; an overlay without one traps focus and ignores cancel (the dialogue
// box). Declaring `initialFocus` is what makes the overlay open with that
// component focused and the ring shown; an overlay without one opens with
// nothing focused. Modal is the general-purpose overlay.
export type Overlay = UiParent & {
  attach?: (ui: UiRoot) => void;
  close?: () => void;
  detach?: () => void;
  readonly initialFocus?: Focusable | undefined;
};

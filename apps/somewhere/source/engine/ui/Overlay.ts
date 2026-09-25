import {type UiParent} from './UiChild.js';

// A component attached to a UiRoot as an overlay: it holds the focus scope
// while it is attached, so focus discovery cannot leave it. Declaring `close`
// is what makes the cancel command dismiss it; an overlay without one traps
// focus and ignores cancel (the dialogue box).
export type Overlay = UiParent & {close?: () => void};

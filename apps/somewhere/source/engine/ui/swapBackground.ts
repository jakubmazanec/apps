/* eslint-disable no-param-reassign -- the helper exists to swap the caller's view background */
import {type LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

// Swaps the view's background container for the one belonging to the new state.
// The previous background must be removed individually (never via
// removeChildren, which would also strip the layout internals that live
// alongside it: overflowContainer, mask, stroke), the next one is inserted at
// index 0 so it renders beneath the content, and it is sized to the outgoing
// background right away so it is not stale until the next layout pass.
export function swapBackground(
  view: LayoutContainer,
  previous: pixi.Container,
  next: pixi.Container,
): void {
  view.containerMethods.removeChild(previous);
  view.containerMethods.addChildAt(next, 0);
  view.background = next;
  next.setSize(previous.width, previous.height);
}

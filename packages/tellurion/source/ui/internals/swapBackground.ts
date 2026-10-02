import {type LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

// Swaps the view's background container for the one belonging to the new state.
// The previous background must be removed individually (never via
// removeChildren, which would also strip the layout internals that live
// alongside it: overflowContainer, mask, stroke), the next one is inserted at
// index 0 so it renders beneath the content, and it is sized to the outgoing
// background right away so it is not stale until the next layout pass. States
// the caller left unspecified share one container, so two states routinely
// resolve to the same background; the guard below skips those, because
// removing and re-adding the live background would be a detach/reattach for
// nothing.
export function swapBackground(view: LayoutContainer, next: pixi.Container): void {
  let previous = view.background;

  if (previous === next) {
    return;
  }

  view.containerMethods.removeChild(previous);
  view.containerMethods.addChildAt(next, 0);
  view.background = next;
  next.setSize(previous.width, previous.height);
}

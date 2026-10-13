import {type LayoutContainer} from '@pixi/layout/components';
import {type Container} from 'pixi.js';

/** Sets new background of a layout container, using the previous background size. */
export function setLayerContainerBackground(view: LayoutContainer, next: Container): void {
  let previous = view.background;

  if (previous === next) {
    return;
  }

  view.background = next;

  view.containerMethods.removeChild(previous);
  view.containerMethods.addChildAt(next, 0); // Background must be beneath other content.
  next.setSize(previous.width, previous.height);
}

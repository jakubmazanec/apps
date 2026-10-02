import type * as pixi from 'pixi.js';

import {type UiChild} from '../UiChild.js';

/** The display object of a UI child: a component's view, or the raw pixi container itself. */
export function resolveView(child: UiChild): pixi.Container {
  return 'view' in child ? child.view : child;
}

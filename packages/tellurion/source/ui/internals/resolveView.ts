import type * as pixi from 'pixi.js';

import {type UiChildComponent} from '../UiChildComponent.js';

/** The display object of a UI child: a component's view, or the raw container itself. */
export function resolveView(child: UiChildComponent): pixi.Container {
  return 'view' in child ? child.view : child;
}

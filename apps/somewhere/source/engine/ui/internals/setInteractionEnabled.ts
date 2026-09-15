import {type LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

// A disabled widget takes no pointer events and shows no affordance; an enabled one takes the
// cursor its widget was built with. `cursor` therefore only applies when enabling, which is why it
// has a default rather than being required at every call site.
export function setInteractionEnabled(
  view: LayoutContainer,
  enabled: boolean,
  cursor: pixi.Cursor = 'default',
): void {
  view.eventMode = enabled ? 'static' : 'none';
  view.cursor = enabled ? cursor : 'default';
}

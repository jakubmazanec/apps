import {type LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {attachHitArea} from '../../utilities/attachHitArea.js';
import {attachHoverHandlers} from './attachHoverHandlers.js';

// The interaction every widget in the kit shares: a pointer-interactive view, a hit area that
// tracks the computed layout rather than the backgrounds swapped in and out of it, and hover
// transitions between 'normal' and 'hovered'. A disabled widget takes no pointer events and shows
// no affordance; an enabled one takes the cursor its widget was built with.
export function attachWidgetInteraction(
  view: LayoutContainer,
  {
    cursor,
    getState,
    setState,
  }: {
    cursor: pixi.Cursor;
    getState: () => string;
    setState: (state: 'hovered' | 'normal') => void;
  },
): void {
  view.eventMode = 'static';
  view.cursor = cursor;

  attachHitArea(view);
  attachHoverHandlers(view, getState, setState);
}

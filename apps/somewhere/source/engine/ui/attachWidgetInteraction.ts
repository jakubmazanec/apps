import {type LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {attachHitArea} from './attachHitArea.js';
import {attachHoverHandlers} from './attachHoverHandlers.js';
import {setInteractionEnabled} from './setInteractionEnabled.js';

// The interaction every widget in the kit shares: a pointer-interactive view, a hit area that
// tracks the computed layout rather than the backgrounds swapped in and out of it, and hover
// transitions between 'normal' and 'hovered'.
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
  setInteractionEnabled(view, true, cursor);
  attachHitArea(view);
  attachHoverHandlers(view, getState, setState);
}

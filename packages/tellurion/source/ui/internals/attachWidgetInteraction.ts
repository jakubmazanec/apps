import {type LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {attachHitArea} from '../../utilities/attachHitArea.js';

// The interaction every widget in the kit shares: a pointer-interactive view, a hit area that
// tracks the computed layout rather than the backgrounds swapped in and out of it, and hover
// transitions between 'normal' and 'hovered'. A disabled widget takes no pointer events and shows
// no affordance; an enabled one takes the cursor its widget was built with.
export function attachWidgetInteraction(
  view: LayoutContainer,
  {cursor, setState}: {cursor: pixi.Cursor; setState: (state: 'hovered' | 'normal') => void},
): void {
  view.eventMode = 'static';
  view.cursor = cursor;

  attachHitArea(view);

  // Moves the widget to 'hovered' when the pointer enters and back to 'normal'
  // when it leaves, unless the widget is disabled: disable() sets eventMode to
  // 'none', and Pixi dispatches nothing to a view that is not interactive. A
  // repeat of the current state (e.g. a second pointer entering) is harmless,
  // since setState only re-applies it.
  view.on('pointerover', () => {
    setState('hovered');
  });
  view.on('pointerout', () => {
    setState('normal');
  });
}

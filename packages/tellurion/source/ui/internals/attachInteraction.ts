import {type LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {attachHitArea} from '../../utilities/attachHitArea.js';

/**
 * Attaches interactions handling to a component. Currently it changes cursor and state when
 * hovered.
 */
export function attachInteraction(
  view: LayoutContainer,
  {cursor, setState}: {cursor: pixi.Cursor; setState: (state: 'hovered' | 'normal') => void},
): void {
  view.eventMode = 'static';
  view.cursor = cursor;

  attachHitArea(view);

  // A disabled component has `eventMode: 'none`, so the following callbacks aren't triggered for
  // such components.
  view.on('pointerover', () => {
    setState('hovered');
  });
  view.on('pointerout', () => {
    setState('normal');
  });
}

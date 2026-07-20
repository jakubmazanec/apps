/* eslint-disable no-param-reassign -- the helper exists to install the hit area on the caller's view */
import {type LayoutContainer} from '@pixi/layout/components';
import * as pixi from 'pixi.js';

// The state backgrounds are swapped in and out of the view, and a freshly
// attached child's transform is stale until the next render, which would
// let hits in that window fall through the view (e.g. a click whose
// pointerover and pointerdown arrive in the same frame). The hit area
// keeps hit testing independent of the background children.
export function attachHitArea(view: LayoutContainer): void {
  view.hitArea = new pixi.Rectangle();

  view.on('layout', ({computedLayout}) => {
    (view.hitArea as pixi.Rectangle).width = computedLayout.width;
    (view.hitArea as pixi.Rectangle).height = computedLayout.height;
  });
}

import {type LayoutContainer} from '@pixi/layout/components';
import {type FederatedPointerEvent} from 'pixi.js';

import {snapToStep} from './snapToStep.js';

export function valueFromEvent(
  event: FederatedPointerEvent,
  view: LayoutContainer,
  {trackWidth, min, max, step}: {trackWidth: number; min: number; max: number; step: number},
): number {
  let local = event.getLocalPosition(view);
  let ratio = trackWidth === 0 ? 0 : local.x / trackWidth;

  return snapToStep(min + ratio * (max - min), {min, max, step});
}

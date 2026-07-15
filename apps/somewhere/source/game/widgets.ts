import * as pixi from 'pixi.js';

import {Button} from '../engine/ui/Button.js';
import {Text} from '../engine/ui/Text.js';
import {type FocusRingOptions} from '../engine/ui/UiRoot.js';
import {audio} from './audio.js';

// Nine-slice insets for the shared widget art in the `default` bundle.
export const BUTTON_SLICE = {leftWidth: 4, topHeight: 8, rightWidth: 4, bottomHeight: 8};
export const BUTTON_ACTIVE_SLICE = {leftWidth: 4, topHeight: 8, rightWidth: 4, bottomHeight: 4};
export const BANNER_SLICE = {leftWidth: 12, topHeight: 4, rightWidth: 12, bottomHeight: 12};
export const INPUT_SLICE = {leftWidth: 4, topHeight: 4, rightWidth: 4, bottomHeight: 4};

// The focus-ring configuration every screen with keyboard navigation uses.
export const FOCUS_RING: FocusRingOptions = {
  assetName: 'focus-ring',
  leftWidth: 4,
  topHeight: 4,
  rightWidth: 4,
  bottomHeight: 4,
  padding: 8,
};

export function nineSlice(
  name: string,
  slice: {bottomHeight: number; leftWidth: number; rightWidth: number; topHeight: number},
): pixi.NineSliceSprite {
  return new pixi.NineSliceSprite({texture: pixi.Assets.get(name), ...slice});
}

export type CreateButtonOptions = {
  label: string;
  onClick: () => void;
  fontSize?: number;
  layout?: pixi.ContainerOptions['layout'];
};

// The standard button: nine-slice art from the default bundle, monogram-outline
// label, 3D press offset. Each call builds fresh backgrounds (a Button owns and
// destroys its background sprites, so instances must never be shared).
export function createButton({label, onClick, fontSize = 48, layout}: CreateButtonOptions): Button {
  return new Button({
    backgrounds: {
      normal: nineSlice('button-normal', BUTTON_SLICE),
      hovered: nineSlice('button-hovered', BUTTON_SLICE),
      active: nineSlice('button-active', BUTTON_ACTIVE_SLICE),
      disabled: nineSlice('button-disabled', BUTTON_SLICE),
    },
    children: [
      new Text({
        text: label,
        fontFamily: 'monogram-outline',
        fontSize,
        fill: 0xffffff,
        layout: true,
      }),
    ],
    pressOffset: 4,
    onClick: () => {
      audio.play(pixi.Assets.get<AudioBuffer>('ui-click'), {bus: 'ui'});
      onClick();
    },
    layout: {padding: 8, ...(typeof layout === 'object' ? layout : undefined)},
  });
}

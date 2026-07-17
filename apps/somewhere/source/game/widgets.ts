import * as pixi from 'pixi.js';

import {Button} from '../engine/ui/Button.js';
import {Text} from '../engine/ui/Text.js';
import {assets} from './assets.js';
import {audio} from './audio.js';

// All widget art lives in the `ui` spritesheet (default bundle, 1× art px).
// Nine-slice insets ship as per-frame `borders` in the atlas JSON and land on
// `texture.defaultBorders`, so consumers never pass insets in code.
export function nineSlice(name: string): pixi.NineSliceSprite {
  return new pixi.NineSliceSprite({texture: assets.texture('ui', name)});
}

export type CreateButtonOptions = {
  label: string;
  onClick: () => void;
  fontSize?: number;
  layout?: pixi.ContainerOptions['layout'];
};

// The standard button: nine-slice art from the ui atlas, monogram-outline
// label, 3D press offset. Each call builds fresh backgrounds (a Button owns and
// destroys its background sprites, so instances must never be shared).
export function createButton({label, onClick, fontSize = 12, layout}: CreateButtonOptions): Button {
  return new Button({
    backgrounds: {
      normal: nineSlice('button-normal'),
      hovered: nineSlice('button-hovered'),
      active: nineSlice('button-active'),
      disabled: nineSlice('button-disabled'),
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
    pressOffset: 1,
    onClick: () => {
      audio.play(assets.sound('ui-click'), {bus: 'ui'});
      onClick();
    },
    layout: {padding: 2, ...(typeof layout === 'object' ? layout : undefined)},
  });
}

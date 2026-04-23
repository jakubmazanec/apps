import type * as pixi from 'pixi.js';

import {type UiTheme} from '../source/engine/ui/UiTheme.js';

function texture(label: string): pixi.Texture {
  let sentinel = {label};

  return sentinel as never;
}

// Named sentinels, not real textures: the suites that use this mock pixi.js
// wholesale. Distinct objects let a test assert which entry a widget read.
export function createTestTheme(): UiTheme {
  return {
    button: {
      normal: texture('button-normal'),
      hovered: texture('button-hovered'),
      active: texture('button-active'),
      disabled: texture('button-disabled'),
    },
    textInput: {
      normal: texture('text-input-normal'),
      hovered: texture('text-input-hovered'),
      disabled: texture('text-input-disabled'),
    },
    slider: {
      track: texture('slider-track'),
      fill: texture('slider-fill'),
      hovered: texture('slider-track-hovered'),
      disabled: texture('slider-track-disabled'),
    },
    toggle: {
      unchecked: texture('toggle-unchecked'),
      checked: texture('toggle-checked'),
      hovered: texture('toggle-hovered'),
      hoveredChecked: texture('toggle-hovered-checked'),
      disabled: texture('toggle-disabled'),
      disabledChecked: texture('toggle-disabled-checked'),
    },
    panel: {background: texture('banner')},
    focusRing: {texture: texture('focus-ring'), padding: 2},
    text: {
      label: {fontFamily: 'monogram-outline', fontSize: 12, fill: 0xffffff},
      body: {fontFamily: 'monogram', fontSize: 12, fill: 0xffffff},
    },
  };
}

import {type UiThemeDescription} from 'tellurion';

import {BUTTON_PADDING_X, BUTTON_PADDING_Y} from './getSceneArea.js';
import {palette} from './palette.js';

// All UI art lives in the `ui` spriteset in the `default` bundle, which is the
// only bundle loaded when Game.init resolves this. Nine-slice insets ship as
// per-frame `borders` in ui.json, so nothing here declares them. The art is
// drawn by scripts/generate-ui-atlas.mjs. The status line, which lies on the
// picture, takes `monogram-outline` where it is created.
export const theme: UiThemeDescription = {
  button: {
    normal: ['ui', 'button-normal'],
    hovered: ['ui', 'button-hovered'],
    active: ['ui', 'button-active'],
    disabled: ['ui', 'button-disabled'],
    layout: {
      paddingTop: BUTTON_PADDING_Y,
      paddingBottom: BUTTON_PADDING_Y,
      paddingLeft: BUTTON_PADDING_X,
      paddingRight: BUTTON_PADDING_X,
    },
  },
  textInput: {
    normal: ['ui', 'text-input-normal'],
    hovered: ['ui', 'text-input-hovered'],
    disabled: ['ui', 'text-input-disabled'],
  },
  slider: {
    track: ['ui', 'slider-track'],
    fill: ['ui', 'slider-fill'],
    hovered: ['ui', 'slider-track-hovered'],
    disabled: ['ui', 'slider-track-disabled'],
  },
  toggle: {
    unchecked: ['ui', 'toggle-unchecked'],
    checked: ['ui', 'toggle-checked'],
    hovered: ['ui', 'toggle-hovered'],
    hoveredChecked: ['ui', 'toggle-hovered-checked'],
    disabled: ['ui', 'toggle-disabled'],
    disabledChecked: ['ui', 'toggle-disabled-checked'],
  },
  panel: {
    background: ['ui', 'window'],
  },
  modal: {
    scrimColor: palette.black,
    scrimAlpha: 0.6,
  },
  focusRing: {
    texture: ['ui', 'focus-ring'],
    padding: 2,
  },
  text: {
    label: {
      fontFamily: 'monogram',
      fontSize: 12,
      fill: palette.white,
    },
    body: {
      fontFamily: 'monogram',
      fontSize: 12,
      fill: palette.white,
    },
  },
};

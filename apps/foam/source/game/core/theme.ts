import {type UiThemeDescription} from 'tellurion';

import {BUTTON_PADDING_X, BUTTON_PADDING_Y} from './getSceneArea.js';
import {palette} from './palette.js';

/**
 * How long a UI fade lasts, in ms. Anything the player can click or tap (a window, a panel, its
 * buttons, a list of choices) fades in and out within 100 ms, so it never makes the player wait.
 * Only a modal's dimmed backdrop may take longer, up to 300 ms, because a click on it is not a
 * primary action. The menu and Options fade their backdrop together with the panel: Tellurion's
 * `Modal` fades both as one view with one duration, so the backdrop takes the same 100 ms. The
 * night screen's windows, the story windows and the travel window, draw no backdrop: the night
 * screen dims the scene behind them in 100 ms with the first window (at once when a night starts,
 * whose first place appears under its description), keeps it dimmed from one window to the next,
 * and lifts it in 100 ms once the last one has faded out. A change of place goes through black: the
 * scene goes to black in 100 ms with the window that takes the player away, and comes back dimmed
 * in 100 ms with the next window.
 */
export const UI_FADE_DURATION = 100;

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

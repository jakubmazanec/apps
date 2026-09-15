import {type UiThemeDescription} from '../../engine/ui/UiTheme.js';

// All UI art lives in the `ui` spriteset in the `default` bundle, which is the
// only bundle loaded when Game.init resolves this. Nine-slice insets ship as
// per-frame `borders` in ui.json, so nothing here declares them.
export const theme: UiThemeDescription = {
  button: {
    normal: ['ui', 'button-normal'],
    hovered: ['ui', 'button-hovered'],
    active: ['ui', 'button-active'],
    disabled: ['ui', 'button-disabled'],
    layout: {padding: 2},
    pressOffset: 1,
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
  panel: {background: ['ui', 'banner']},
  focusRing: {texture: ['ui', 'focus-ring'], padding: 2},
  text: {
    label: {fontFamily: 'monogram-outline', fontSize: 12, fill: 0xffffff},
    body: {fontFamily: 'monogram', fontSize: 12, fill: 0xffffff},
  },
};

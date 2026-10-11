import {Button, Text} from 'tellurion';

import {game} from '../core/game.js';
import {
  BUTTON_HEIGHT,
  BUTTON_PADDING_X,
  getSceneArea,
  LINE_HEIGHT,
  MARGIN,
  type SceneArea,
} from '../core/getSceneArea.js';
import {measureText} from '../core/measureText.js';

// The top row the night screen and the log screen share: the status line at the
// left and the Menu button at the right, with the sizes and the label their
// buttons are built from. Each screen places the status line itself; the night
// screen's place button stands beside it. This module imports no screen, so
// both screens import it with no cycle.

export function getButtonWidth(label: string): number {
  return measureText(label, 'label') + 2 * BUTTON_PADDING_X;
}

// A label with an explicit size: a leaf sized by its own bounds is measured
// again later, and its button would move it then.
export function createLabel(text: string): Text {
  return new Text({
    text,
    theme: game.theme,
    layout: {width: measureText(text, 'label'), height: LINE_HEIGHT},
  });
}

/** The scene area under the top row, for the screen's present size. */
export function getArea(): SceneArea {
  return getSceneArea(
    game.app.screen.width / game.pixelScale,
    game.app.screen.height / game.pixelScale,
  );
}

/** The status line, in the outline font; the screen positions it and `setStatus` writes it. */
export function createStatusText(): Text {
  return new Text({
    text: '',
    theme: game.theme,
    fontFamily: 'monogram-outline',
    layout: {position: 'absolute', left: 0, top: 0, width: 0, height: LINE_HEIGHT},
  });
}

/** Writes the status line's text and gives it the text's width. */
export function setStatus(statusText: Text, status: string): void {
  statusText.setText(status);
  statusText.view.layout = {width: measureText(status, 'label')};
}

/** The Menu button at the right end of the top row; `onClick` opens the screen's menu. */
export function createMenuButton(onClick: () => void): Button {
  return new Button({
    theme: game.theme,
    children: [createLabel('Menu')],
    layout: {
      position: 'absolute',
      right: MARGIN,
      top: MARGIN,
      width: getButtonWidth('Menu'),
      height: BUTTON_HEIGHT,
    },
    onClick,
  });
}

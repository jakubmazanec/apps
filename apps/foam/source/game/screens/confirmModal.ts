import {
  Button,
  Container,
  Modal,
  Panel,
  type Scheduler,
  Text,
  type UiRoot,
  wrapText,
} from 'tellurion';

import {game} from '../core/game.js';
import {LINE_HEIGHT} from '../core/getSceneArea.js';
import {measureText} from '../core/measureText.js';
import {UI_FADE_DURATION} from '../core/theme.js';
import {createLabel} from './topRow.js';
import {createWindowTitle, WINDOW_PADDING} from './windowTitle.js';

export type ConfirmModalOptions = {
  /** UI root of the screen that opens the window. */
  ui: UiRoot;

  /** Scheduler of that screen; it drives the fade. */
  scheduler: Scheduler;

  /** The window's title. */
  title: string;

  /** The line under the title. */
  text: string;

  /** The label of the button left of Close. */
  action: string;

  /** Called when the action's button is pressed, unless the window is closing. */
  onAction: () => void;

  /** Called once the window has closed. */
  onClosed: () => void;
};

const ROW_GAP = 6;
const ROW_WIDTH = 136;
// The action and Close share the row, with the gap between them.
const BUTTON_WIDTH = (ROW_WIDTH - ROW_GAP) / 2;

// The window is built per call, over the window that asks. Close and the
// cancel command close it.
export function openConfirmModal({
  ui,
  scheduler,
  title,
  text,
  action,
  onAction,
  onClosed,
}: ConfirmModalOptions): Modal {
  let wrapped = wrapText(text, ROW_WIDTH, measureText);
  let panel = new Panel({
    theme: game.theme,
    children: [
      createWindowTitle(title, ROW_WIDTH),
      new Text({
        text: wrapped,
        theme: game.theme,
        role: 'body',
        layout: {width: ROW_WIDTH, height: wrapped.split('\n').length * LINE_HEIGHT},
      }),
    ],
    layout: {
      ...WINDOW_PADDING,
      flexDirection: 'column',
      gap: 4,
      alignItems: 'stretch',
    },
  });
  // Close is built before the modal, which declares it as its initial focus,
  // so Enter pressed twice cannot start or erase anything: the first press
  // opens the window and the second closes it. Its click reads the modal from
  // this variable, assigned when the modal is built.
  let modal: Modal;
  let close = new Button({
    theme: game.theme,
    children: [createLabel('Close')],
    layout: {width: BUTTON_WIDTH},
    onClick: () => {
      modal.close();
    },
  });

  modal = new Modal({
    theme: game.theme,
    children: [panel],
    layout: {justifyContent: 'center', alignItems: 'center'},
    scheduler,
    fadeDuration: UI_FADE_DURATION,
    initialFocus: close,
    onClosed,
  });

  // The action is added after the modal exists, because it reads it. A press
  // can still arrive during the fade: Escape and then Enter must not act over
  // a closing window. Close needs no check, as close() does nothing on a
  // closing modal.
  let isClosing = () => modal.state === 'closing' || modal.state === 'closed';

  panel.addChild(
    new Container({
      children: [
        new Button({
          theme: game.theme,
          children: [createLabel(action)],
          layout: {width: BUTTON_WIDTH},
          onClick: () => {
            if (!isClosing()) {
              onAction();
            }
          },
        }),
        close,
      ],
      layout: {gap: ROW_GAP, width: ROW_WIDTH},
    }),
  );
  // The focus goes back to whatever had it before once the window closes.
  ui.addOverlay(modal);

  return modal;
}

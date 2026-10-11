import {
  Button,
  type GameScreenState,
  Modal,
  Panel,
  type Scheduler,
  Text,
  type UiRoot,
} from 'tellurion';

import {game} from '../core/game.js';
import {BUTTON_PADDING_X} from '../core/getSceneArea.js';
import {measureText} from '../core/measureText.js';
import {UI_FADE_DURATION} from '../core/theme.js';
// The menuModal -> mainMenuScreen -> nightScreen -> menuModal static import
// cycle is deliberate and safe: each module reads the next one's binding only
// inside a click handler (Quit to menu here, New Game in the main menu), long
// after all of them have evaluated.
// eslint-disable-next-line import/no-cycle -- see comment above: the cycle only resolves inside event handlers, long after both modules evaluate
import {mainMenuScreen} from './mainMenuScreen.js';
import {openOptionsModal} from './optionsModal.js';
import {createWindowTitle, WINDOW_PADDING} from './windowTitle.js';

/** A screen that opens the night's menu: the night screen and the log screen. */
type MenuScreen = {
  state: GameScreenState;
  ui: UiRoot;
  scheduler: Scheduler;
  contents: {menuModal: Modal | null; optionsModal: Modal | null};
};

export type MenuModalOptions = {
  /** UI root of the screen that opens the window. */
  ui: UiRoot;

  /** Scheduler of that screen; it drives the fade. */
  scheduler: Scheduler;

  onOptions: () => void;
  onQuit: () => void;

  /** Called once the window has closed. */
  onClosed: () => void;
};

// The window is built per call. Resume closes it, and so does the cancel
// command, which the engine sends to the topmost overlay.
export function openMenuModal({
  ui,
  scheduler,
  onOptions,
  onQuit,
  onClosed,
}: MenuModalOptions): Modal {
  // The three buttons share the width of the longest label; the panel stretches them.
  let width =
    Math.max(...['Resume', 'Options', 'Quit to menu'].map((label) => measureText(label, 'label'))) +
    2 * BUTTON_PADDING_X;
  let panel = new Panel({
    theme: game.theme,
    children: [createWindowTitle('Menu', width)],
    layout: {
      ...WINDOW_PADDING,
      flexDirection: 'column',
      gap: 4,
      alignItems: 'stretch',
    },
  });
  // Resume is built before the modal, which declares it as its initial focus,
  // so the menu opens with the ring on Resume. Its click reads the modal from
  // this variable, assigned when the modal is built.
  let modal: Modal;
  let resumeButton = new Button({
    theme: game.theme,
    children: [new Text({text: 'Resume', theme: game.theme, layout: true})],
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
    initialFocus: resumeButton,
    onClosed,
  });

  // The other buttons are added after the modal exists, because they read it.
  // A press can still arrive during the fade: Escape and then Enter must not
  // quit the night or open the Options window over a closing menu. Resume
  // needs no check, as close() does nothing on a closing modal.
  let isClosing = () => modal.state === 'closing' || modal.state === 'closed';

  panel.addChild(
    resumeButton,
    new Button({
      theme: game.theme,
      children: [new Text({text: 'Options', theme: game.theme, layout: true})],
      onClick: () => {
        if (!isClosing()) {
          onOptions();
        }
      },
    }),
    new Button({
      theme: game.theme,
      children: [new Text({text: 'Quit to menu', theme: game.theme, layout: true})],
      onClick: () => {
        if (!isClosing()) {
          onQuit();
        }
      },
    }),
  );
  // The focus goes back to whatever had it before once the window closes.
  ui.addOverlay(modal);

  return modal;
}

// The night's menu, which the night screen and the log screen open with their
// Menu button and with Escape. The menu also opens above a story window, whose
// text waits meanwhile. A hidden screen opens no menu: Quit to menu hides the
// screen inside its click, and an Escape in the same frame still reaches
// onUpdate, where the screen has no overlay left.
export function openMenu(screen: MenuScreen): void {
  if (screen.state !== 'shown' || screen.contents.menuModal !== null) {
    return;
  }

  screen.contents.menuModal = openMenuModal({
    ui: screen.ui,
    scheduler: screen.scheduler,
    onOptions: () => {
      screen.contents.optionsModal = openOptionsModal({
        ui: screen.ui,
        scheduler: screen.scheduler,
        onClosed: () => {
          screen.contents.optionsModal = null;
        },
      });
    },
    onQuit: () => {
      // The swap runs this screen's onHide, which destroys the menu.
      // showScreen never rejects; a failure lands on the error screen.
      void game.showScreen(mainMenuScreen);
    },
    onClosed: () => {
      screen.contents.menuModal = null;
    },
  });
}

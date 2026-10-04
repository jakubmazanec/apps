import {Button, Modal, Panel, type Scheduler, Text, type UiRoot} from 'tellurion';

import {game} from '../core/game.js';

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
  let panel = new Panel({
    theme: game.theme,
    children: [new Text({text: 'Menu', theme: game.theme, layout: true})],
    layout: {
      padding: 8,
      alignItems: 'center',
      flexDirection: 'column',
      gap: 4,
    },
  });
  let modal = new Modal({
    theme: game.theme,
    children: [panel],
    layout: {justifyContent: 'center', alignItems: 'center'},
    scheduler,
    fadeDuration: 200,
    onClosed,
  });
  // The buttons are added after the modal exists, because they read it. A
  // press can still arrive during the fade: Escape and then Enter must not
  // quit the night or open the Options window over a closing menu. Resume
  // needs no check, as close() does nothing on a closing modal.
  let isClosing = () => modal.state === 'closing' || modal.state === 'closed';
  let resumeButton = new Button({
    theme: game.theme,
    children: [new Text({text: 'Resume', theme: game.theme, layout: true})],
    onClick: () => {
      modal.close();
    },
  });

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
  ui.addOverlay(modal);
  // After addOverlay, which clears the focus for the new scope. The focus goes
  // back to whatever had it before once the window closes.
  ui.focus(resumeButton);

  return modal;
}

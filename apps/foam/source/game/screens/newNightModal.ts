import {
  Button,
  Container,
  Modal,
  Panel,
  type Scheduler,
  Text,
  TextInput,
  type UiRoot,
} from 'tellurion';

import {game} from '../core/game.js';
import {UI_FADE_DURATION} from '../core/theme.js';
import {todaySeed} from '../core/todaySeed.js';
import {createLabel} from './topRow.js';
import {createWindowTitle, WINDOW_PADDING} from './windowTitle.js';

export type NewNightModalOptions = {
  /** UI root of the screen that opens the window. */
  ui: UiRoot;

  /** Scheduler of that screen; it drives the fade. */
  scheduler: Scheduler;

  /** Called once the window has closed. */
  onClosed: () => void;

  /** Called with the typed seed when Start is pressed or Enter is pressed in the field. */
  onStart: (seed: number) => void;
};

const ROW_GAP = 6;
const ROW_WIDTH = 136;
const ROW_HEIGHT = 12;
// Start and Close share the row, with the gap between them.
const BUTTON_WIDTH = (ROW_WIDTH - ROW_GAP) / 2;

// The window is built per call, so the field reads the clock when the window
// opens: a page loaded before midnight shows the new day once New Game is
// pressed after it. The window reports the seed and reads no screen, so the
// main menu starts the night and the import cycle keeps its one link from the
// main menu to the night screen.
export function openNewNightModal({ui, scheduler, onClosed, onStart}: NewNightModalOptions): Modal {
  // Start is created before the field, whose onChange enables and disables it.
  let start = new Button({
    theme: game.theme,
    children: [createLabel('Start')],
    layout: {width: BUTTON_WIDTH},
    onClick: startNight,
  });
  let input = new TextInput({
    theme: game.theme,
    value: String(todaySeed()),
    maxLength: 15,
    container: game.app.canvas.parentElement ?? document.body,
    onChange: (changed) => {
      changed.value = changed.value.replaceAll(/\D/gu, '');

      if (changed.value === '') {
        start.disable();
      } else {
        start.enable();
      }
    },
    onSubmit: startNight,
    layout: {flexGrow: 1, height: ROW_HEIGHT},
  });

  function startNight(): void {
    if (input.value !== '') {
      onStart(Number(input.value));
    }
  }

  let panel = new Panel({
    theme: game.theme,
    children: [
      createWindowTitle('New night', ROW_WIDTH),
      new Container({
        children: [
          new Text({text: 'Seed', theme: game.theme, layout: {width: 36, height: ROW_HEIGHT}}),
          input,
        ],
        layout: {gap: ROW_GAP, width: ROW_WIDTH, height: ROW_HEIGHT, alignItems: 'center'},
      }),
    ],
    layout: {
      ...WINDOW_PADDING,
      flexDirection: 'column',
      gap: 4,
      alignItems: 'stretch',
    },
  });
  // No initialFocus. Nothing is focused on open: on a phone, a focused field
  // raises the keyboard before the player has decided to type, and the date is
  // right for most.
  let modal = new Modal({
    theme: game.theme,
    children: [panel],
    layout: {justifyContent: 'center', alignItems: 'center'},
    scheduler,
    fadeDuration: UI_FADE_DURATION,
    onClosed,
  });

  // Added after the modal exists, because Close's handler closes that modal.
  // Focus returns to whatever was focused before the window opened, via the
  // focus-scope pop. The margin and the column's gap put the row 8 under the
  // field.
  panel.addChild(
    new Container({
      children: [
        start,
        new Button({
          theme: game.theme,
          children: [createLabel('Close')],
          layout: {width: BUTTON_WIDTH},
          onClick: () => {
            modal.close();
          },
        }),
      ],
      layout: {gap: ROW_GAP, width: ROW_WIDTH, marginTop: 4},
    }),
  );
  ui.addOverlay(modal);

  return modal;
}

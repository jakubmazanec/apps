import * as pixi from 'pixi.js';

import {type GameInput} from '../../input/GameInput.js';
import {type Game} from '../Game.js';

/**
 * Attaches `input` to the game view and polls it once per frame, routing focus
 * commands into the current screen. Registers the detach on `disposables`, so
 * the input lives exactly as long as the game's ref does.
 */
export function adoptInput(game: Game, disposables: DisposableStack, input: GameInput): void {
  let updateInput = () => {
    input.update();

    if (!game.currentScreen) {
      return;
    }

    if (input.focusPressed('activate')) {
      game.currentScreen.ui.activate();
    }

    if (input.focusPressed('increase')) {
      game.currentScreen.ui.increase();
    }

    if (input.focusPressed('decrease')) {
      game.currentScreen.ui.decrease();
    }

    if (input.focusPressed('next')) {
      game.currentScreen.ui.focusNext();
    }

    if (input.focusPressed('previous')) {
      game.currentScreen.ui.focusPrevious();
    }

    for (let direction of ['up', 'down', 'left', 'right'] as const) {
      if (input.focusPressed(direction)) {
        game.currentScreen.ui.moveFocus(direction);
      }
    }

    // TODO: I don't like this magic, let's think about different solution
    // Offered to the innermost focus scope first (a modal closes itself), then
    // to the screen. This is the whole reason cancel is a focus command: a
    // paused world cannot unpause itself, and nothing here runs inside it.
    if (input.focusPressed('cancel') && !game.currentScreen.ui.cancel()) {
      game.currentScreen.cancel();
    }
  };

  input.attach(game.view);
  game.app.ticker.add(updateInput, game, pixi.UPDATE_PRIORITY.HIGH);

  disposables.defer(() => {
    game.app.ticker.remove(updateInput, game);
    input.detach();
  });
}

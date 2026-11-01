import * as pixi from 'pixi.js';

import {type GameInput} from '../../input/GameInput.js';
import {isTextEntryTarget} from '../../utilities/isTextEntryTarget.js';
import {type Game} from '../Game.js';

export function adoptInput(game: Game, disposables: DisposableStack, input: GameInput): void {
  let handleTextEntryKey = (event: KeyboardEvent) => {
    if (!isTextEntryTarget(event) || !game.currentScreen) {
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      return;
    }

    if (input.focusMatches('activate', event)) {
      game.currentScreen.ui.activate();
    } else if (input.focusMatches('cancel', event)) {
      game.currentScreen.ui.deactivate();
    }
  };
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

    if (input.focusPressed('cancel')) {
      game.currentScreen.ui.cancel();
    }
  };

  input.attach(game);
  globalThis.addEventListener('keydown', handleTextEntryKey);
  game.app.ticker.add(updateInput, game, pixi.UPDATE_PRIORITY.HIGH);
  disposables.defer(() => {
    game.app.ticker.remove(updateInput, game);
    globalThis.removeEventListener('keydown', handleTextEntryKey);
    input.detach();
  });
}

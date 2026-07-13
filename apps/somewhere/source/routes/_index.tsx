import {useEffect, useState} from 'react';
import {type MetaFunction} from 'react-router';

import {type Game} from '../engine/app/Game.js';
import {GameProvider} from '../engine/app/GameProvider.js';
import Renderer from '../ui/Renderer.js';

export const meta: MetaFunction = () => [{title: 'Somewhere'}];

export default function Index() {
  let [game, setGame] = useState<Game | undefined>(undefined);

  // TODO: do better handling of the async game init() than this useEffect, which is too imperative and contains too much boilerlate
  useEffect(() => {
    let controller = new AbortController();

    void (async () => {
      let [{game: importedGame}, {loadingScreen}, {mainMenuScreen}, {gameScreen}] =
        await Promise.all([
          import('../game/game.js'),
          import('../game/loadingScreen.js'),
          import('../game/mainMenuScreen.js'),
          import('../game/gameScreen.js'),
        ]);

      if (controller.signal.aborted) {
        return;
      }

      await importedGame.init();

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the awaited init() above can be aborted by the effect cleanup, so the flag is not statically false here
      if (controller.signal.aborted) {
        return;
      }

      // All screens are registered in one place at boot: screens are static for
      // the rest of the game process, and Game.showScreen silently no-ops on an
      // unregistered screen — gameScreen must be known before New Game.
      importedGame.addLoadingScreen(loadingScreen);
      importedGame.addScreen(mainMenuScreen);
      importedGame.addScreen(gameScreen);
      // showScreen() rejects when a bundle load fails; the game hid its
      // loading screen and stays usable, so the error is only reported here.
      importedGame.showScreen(mainMenuScreen).catch((error: unknown) => {
        // eslint-disable-next-line no-console -- no error UI exists yet
        console.error(error);
      });
      setGame(importedGame);
    })();

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <GameProvider game={game}>
      <div className="h-full w-full">
        <Renderer />
      </div>
    </GameProvider>
  );
}

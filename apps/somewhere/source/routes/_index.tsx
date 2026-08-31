import {useEffect, useState} from 'react';
import {type MetaFunction} from 'react-router';

import {type Game} from '../engine/app/Game.js';
import {GameProvider} from '../engine/app/GameProvider.js';
import Renderer from '../ui/Renderer.js';

export const meta: MetaFunction = () => [{title: 'Somewhere'}];

export default function Index() {
  let [game, setGame] = useState<Game | undefined>(undefined);

  // TODO: do better handling of the async game init() than this useEffect, which is too imperative
  // and contains too much boilerlate
  useEffect(() => {
    let controller = new AbortController();

    (async () => {
      let [{game: importedGame}, {loadingScreen}, {errorScreen}, {mainMenuScreen}, {worldScreen}] =
        await Promise.all([
          import('../game/core/game.js'),
          import('../game/screens/loadingScreen.js'),
          import('../game/screens/errorScreen.js'),
          import('../game/screens/mainMenuScreen.js'),
          import('../game/screens/worldScreen.js'),
          // Eval audio bootstrap (decode context + first-gesture unlock) before
          // init() below loads the default bundle's audio assets.
          import('../game/core/audio.js'),
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
      // unregistered screen — worldScreen must be known before New Game.
      importedGame.addLoadingScreen(loadingScreen);
      importedGame.addErrorScreen(errorScreen);
      importedGame.addScreen(mainMenuScreen);
      importedGame.addScreen(worldScreen);
      // Not awaited: setGame below must run in the same tick so React mounts the canvas
      // during the first transition rather than after it. showScreen never rejects; a
      // failure lands on the error screen.
      void importedGame.showScreen(mainMenuScreen);
      setGame(importedGame);
    })().catch((error: unknown) => {
      // An init() failure (WebGL context creation, a chunk load) cannot reach the error
      // screen: there is no renderer to draw it on. The console is its only report.
      // eslint-disable-next-line no-console -- no renderer exists to surface this
      console.error(error);
    });

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

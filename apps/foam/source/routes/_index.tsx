import {useEffect, useState} from 'react';
import {type MetaFunction} from 'react-router';
import {type Game, GameProvider} from 'tellurion';

import Renderer from '../ui/Renderer.js';

export const meta: MetaFunction = () => [{title: 'Foam'}];

export default function Index() {
  let [game, setGame] = useState<Game | undefined>(undefined);
  let [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    let controller = new AbortController();

    (async () => {
      let [{game: importedGame}, {errorScreen}, {mainMenuScreen}, {nightScreen}] =
        await Promise.all([
          import('../game/core/game.js'),
          import('../game/screens/errorScreen.js'),
          import('../game/screens/mainMenuScreen.js'),
          import('../game/screens/nightScreen.js'),
          // Evaluates the audio bootstrap (decode context and first-gesture
          // unlock) before init() below loads the default bundle's sounds.
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

      // The screens are registered here, once: screens are static for the
      // rest of the game process, and Game.showScreen rejects a screen that
      // was never added.
      importedGame.addErrorScreen(errorScreen);
      importedGame.addScreen(mainMenuScreen);
      importedGame.addScreen(nightScreen);
      // Not awaited: setGame below must run in the same tick so React mounts
      // the canvas during the first transition rather than after it.
      // showScreen never rejects; a failure lands on the error screen.
      void importedGame.showScreen(mainMenuScreen);
      setGame(importedGame);
    })().catch((error: unknown) => {
      // A failed boot (WebGL context creation, a script or asset that did not
      // load) cannot reach the error screen: there is no renderer to draw it
      // on. The page says so in plain text and the console keeps the details.
      // eslint-disable-next-line no-console -- no renderer exists to surface this
      console.error(error);

      if (!controller.signal.aborted) {
        setHasFailed(true);
      }
    });

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <GameProvider game={game}>
      <div className="h-full w-full">
        {game ?
          <Renderer />
        : <p className="flex h-dvh items-center justify-center p-4 text-center">
            {hasFailed ?
              'Foam could not start. Reload the page, or try another browser.'
            : 'Loading…'}
          </p>
        }
      </div>
    </GameProvider>
  );
}

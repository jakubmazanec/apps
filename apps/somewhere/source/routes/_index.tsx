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
    let instance: Game | undefined;

    void (async () => {
      let [{game: importedGame}, {loadingScreen}, {mainScreen}] = await Promise.all([
        import('../game/game.js'),
        import('../game/loadingScreen.js'),
        import('../game/mainScreen.js'),
      ]);

      instance = importedGame;

      if (controller.signal.aborted) {
        return;
      }

      await importedGame.init();

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the awaited init() above can be aborted by the effect cleanup, so the flag is not statically false here
      if (controller.signal.aborted) {
        return;
      }

      importedGame.addLoadingScreen(loadingScreen);
      importedGame.addScreen(mainScreen);
      void importedGame.showScreen(mainScreen);
      setGame(importedGame);
    })();

    return () => {
      controller.abort();
      instance?.destroy();
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

import {useEffect, useState} from 'react';
import {type MetaFunction} from 'react-router';

import {type Game} from '../engine/app/Game.js';
import {GameProvider} from '../engine/app/GameProvider.js';
import Renderer from '../ui/Renderer.js';

export const meta: MetaFunction = () => [{title: 'Somewhere'}];

export default function Index() {
  let [game, setGame] = useState<Game | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      let [{game: importedGame}, {loadingScreen}, {mainScreen}] = await Promise.all([
        import('../game/game.js'),
        import('../game/loadingScreen.js'),
        import('../game/mainScreen.js'),
      ]);
      await importedGame.init();
      importedGame.addLoadingScreen(loadingScreen);
      void importedGame.showScreen(mainScreen);
      setGame(importedGame);
    })();
  }, []);

  return (
    <GameProvider game={game}>
      <div className="h-full w-full">
        <Renderer />
      </div>
    </GameProvider>
  );
}

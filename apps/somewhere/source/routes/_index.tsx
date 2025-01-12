import {useEffect, useState} from 'react';
import {type MetaFunction} from 'react-router';

import {type Game} from '../engine/Game.js';
import {GameProvider} from '../engine/GameProvider.js';
import {game as importedGame} from '../game.client.js';
import Renderer from '../ui/Renderer.js';

export const meta: MetaFunction = () => [{title: 'Somewhere'}];

export default function Index() {
  let [game, setGame] = useState<Game | undefined>(undefined);

  useEffect(() => {
    setGame(importedGame);
  }, []);

  return (
    <GameProvider game={game}>
      <div className="h-full w-full">
        <Renderer />
      </div>
    </GameProvider>
  );
}

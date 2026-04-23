import {type PropsWithChildren} from 'react';

import {type Game} from './Game.js';
import {gameContext} from './gameContext.js';

export type GameProviderProps = {
  game?: Game | undefined;
};

export function GameProvider({children, game}: PropsWithChildren<GameProviderProps>) {
  return <gameContext.Provider value={game}>{children}</gameContext.Provider>;
}

import {type PropsWithChildren} from 'react';

import {type Game} from './Game.js';
import {GameContext} from './GameContext.js';

export type GameProviderProps = PropsWithChildren & {
  game: Game;
};

export function GameProvider({children, game}: GameProviderProps) {
  return <GameContext value={game}>{children}</GameContext>;
}

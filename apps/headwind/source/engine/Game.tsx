import {makeAutoObservable} from 'mobx';
import {createContext, type PropsWithChildren, useContext} from 'react';

import {Map} from './Map.js';

export type GameOptions = {
  map?: Map;
};

export class Game {
  map: Map;
  round = 0;

  constructor({map}: GameOptions = {}) {
    makeAutoObservable(this);
  }

  nextRound() {
    this.round += 1;
  }
}

const GameContext = createContext<Game | null>(null);

export type GameProviderProps = PropsWithChildren & {
  game: Game;
};

export function GameProvider({children, game}: GameProviderProps) {
  return <GameContext value={game}>{children}</GameContext>;
}

export function useGame() {
  const game = useContext(GameContext);

  if (!game) {
    throw new Error('Game is undefined!');
  }

  return game;
}

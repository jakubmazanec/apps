import {useContext} from 'react';

import {GameContext} from './GameContext.js';

export function useGame() {
  const game = useContext(GameContext);

  if (!game) {
    throw new Error('Game is undefined!');
  }

  return game;
}

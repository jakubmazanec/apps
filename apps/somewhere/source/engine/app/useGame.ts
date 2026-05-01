import {useContext} from 'react';

import {gameContext} from './gameContext.js';

export function useGame() {
  return useContext(gameContext);
}

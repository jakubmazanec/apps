import {createContext} from 'react';

import {type Game} from './Game.js';

export const GameContext = createContext<Game | null>(null);

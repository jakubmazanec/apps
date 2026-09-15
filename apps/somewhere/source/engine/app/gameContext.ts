import {createContext} from 'react';

import {type Game} from './Game.js';

export const gameContext = createContext<Game | undefined>(undefined);

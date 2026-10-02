import {type GameInput} from '../input/GameInput.js';
import {type GameAssets} from './GameAssets.js';
import {type GameTheme} from './GameTheme.js';

export type GameOptions = {
  assets: GameAssets;
  input: GameInput;
  theme: GameTheme;
};

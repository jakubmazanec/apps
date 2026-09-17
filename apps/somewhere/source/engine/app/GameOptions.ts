import {type GameInput} from '../input/GameInput';
import {type GameAssets} from './GameAssets';
import {type GameTheme} from './GameTheme';

export type GameOptions = {
  assets: GameAssets;
  input: GameInput;
  theme: GameTheme;
};

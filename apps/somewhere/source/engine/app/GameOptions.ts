import {type GameInput} from '../input/GameInput';
import {type GameAssets} from './GameAssets';
import {type GameTheme} from './GameTheme';

// TODO: assets and input are necesarry, so there are no methods like addInput
export type GameOptions = {
  assets: GameAssets;
  input: GameInput;
  theme: GameTheme;
};

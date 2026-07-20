import {ChoosePixelScale} from './ChoosePixelScale';
import {FocusKeys} from './FocusKeys';
import {GameAssets} from './GameAssets';

export type GameOptions = {
  assets: GameAssets;
  choosePixelScale?: ChoosePixelScale;
  focusKeys?: FocusKeys;
};

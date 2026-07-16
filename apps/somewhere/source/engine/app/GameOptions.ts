import {ChoosePixelScale} from './ChoosePixelScale';
import {FocusKeys} from './FocusKeys';
import {GameAssetBundle} from './GameAssetBundle';

export type GameOptions = {
  assetBundles: GameAssetBundle[];
  choosePixelScale?: ChoosePixelScale;
  focusKeys?: FocusKeys;
};

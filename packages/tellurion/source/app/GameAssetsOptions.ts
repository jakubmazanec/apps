import {type GameAssetBundle} from './GameAssetBundle.js';

export type GameAssetsOptions<Bundles extends readonly GameAssetBundle[]> = {
  bundles: Bundles;
};

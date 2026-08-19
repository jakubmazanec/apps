import {type GameAssetBundle} from './GameAssetBundle';

export type GameAssetsOptions<Bundles extends readonly GameAssetBundle[]> = {
  bundles: Bundles;
};

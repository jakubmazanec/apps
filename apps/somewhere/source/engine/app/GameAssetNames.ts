import {type GameAssetBundle} from './GameAssetBundle';
import {type GameAssetGroup} from './GameAssetGroup';

/** TBD */
export type GameAssetNames<Bundle, Group extends GameAssetGroup> =
  Bundle extends GameAssetBundle ? keyof NonNullable<Bundle[Group]> & string : never;

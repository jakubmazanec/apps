import {type GameAssetBundle} from './GameAssetBundle';

export type GameAssetGroup = Exclude<keyof GameAssetBundle, 'name'>;
export const GameAssetGroup = [
  'fonts',
  'sounds',
  'spritesets',
  'tilemaps',
  'tilesets',
] as const satisfies readonly GameAssetGroup[];

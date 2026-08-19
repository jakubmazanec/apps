/** TBD */
export type GameAssetSources = Record<string, string[]>;

/** TBD */
export type GameAssetBundle = {
  /** TBD */
  name: string;

  /** TBD */
  fonts?: GameAssetSources;

  /** TBD */
  sounds?: GameAssetSources;

  /** TBD */
  spritesets?: GameAssetSources;

  /** TBD */
  tilemaps?: GameAssetSources;

  /** TBD */
  tilesets?: GameAssetSources;
};

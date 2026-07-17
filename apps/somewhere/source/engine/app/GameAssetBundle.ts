export type GameAssetSources = Record<string, string[]>; // asset name → source URLs

export type GameAssetBundle = {
  name: string;
  fonts?: GameAssetSources;
  sounds?: GameAssetSources;
  spritesheets?: GameAssetSources;
  tilemaps?: GameAssetSources;
  tilesets?: GameAssetSources;
};

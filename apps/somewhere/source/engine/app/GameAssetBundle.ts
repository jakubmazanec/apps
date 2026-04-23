export type GameAssetSources = Record<string, string[]>; // asset name → source URLs

export type GameAssetBundle = {
  name: string;
  fonts?: GameAssetSources;
  sounds?: GameAssetSources;
  spritesets?: GameAssetSources;
  tilemaps?: GameAssetSources;
  tilesets?: GameAssetSources;
};

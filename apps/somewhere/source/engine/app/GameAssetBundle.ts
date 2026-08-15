export type GameAssetSources = Record<string, string[]>; // asset name → source URLs

// Picks the packIndex-th character out of the named tileset (see
// Spriteset.fromTileset).
export type CharacterSpritesetEntry = {tileset: string; packIndex: number};

export type GameAssetBundle = {
  name: string;
  fonts?: GameAssetSources;
  sounds?: GameAssetSources;
  spritesets?: GameAssetSources;
  tilemaps?: GameAssetSources;
  tilesets?: GameAssetSources;
  // Spritesets built at runtime from a shared tileset instead of their own
  // file: not part of the pixi manifest — nothing is fetched separately for
  // these.
  characterSpritesets?: Record<string, CharacterSpritesetEntry>;
};

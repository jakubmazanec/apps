import * as pixi from 'pixi.js';

// The atlas decides whether a piece of art is nine-sliced: insets ship as
// per-frame `borders` in the spriteset JSON and reach the texture as
// `defaultBorders` (Spriteset.from). Deriving the choice here rather than
// hard-coding it per widget means adding borders to a frame changes its
// rendering with no code change — and it makes pixi's silent fallback
// unreachable, since NineSliceGeometry.defaultOptions would otherwise
// substitute 10 px insets for a texture that has none.
export function createBackground(texture: pixi.Texture): pixi.Container {
  return texture.defaultBorders === undefined ?
      new pixi.Sprite(texture)
    : new pixi.NineSliceSprite({texture});
}

import * as pixi from 'pixi.js';

// Builds a background per state, preferring an explicit override and falling
// back to the theme's texture for that state. An overridden state builds
// nothing from the theme: a discarded background would never be adopted for
// destruction, so it would leak.
// Every state resolves: UiComponentThemeOptions takes a theme, which carries a
// texture for each of them, or a background for each of them, never neither.
export function resolveThemeBackgrounds<State extends string>(
  states: readonly State[],
  textures: Record<State, pixi.Texture> | undefined,
  overrides: Partial<Record<State, pixi.Container | undefined>> | undefined,
): Record<State, pixi.Container> {
  return Object.fromEntries(
    states.map((state) => {
      let texture = textures?.[state];

      // The atlas decides whether a piece of art is nine-sliced: insets ship as
      // per-frame `borders` in the spriteset JSON and reach the texture as
      // `defaultBorders` (Spriteset.from). Deriving the choice here rather than
      // hard-coding it per widget means adding borders to a frame changes its
      // rendering with no code change — and it makes pixi's silent fallback
      // unreachable, since NineSliceGeometry.defaultOptions would otherwise
      // substitute 10 px insets for a texture that has none.
      return [
        state,
        overrides?.[state] ??
          (texture &&
            (texture.defaultBorders === undefined ?
              new pixi.Sprite(texture)
            : new pixi.NineSliceSprite({texture}))),
      ];
    }),
  ) as Record<State, pixi.Container>;
}

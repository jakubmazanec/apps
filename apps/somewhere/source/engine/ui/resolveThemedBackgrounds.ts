import type * as pixi from 'pixi.js';

import {createBackground} from './createBackground.js';

// Builds a background per state, preferring an explicit override and falling
// back to the theme's texture for that state. An overridden state builds
// nothing from the theme: a discarded background would never be adopted for
// destruction, so it would leak.
export function resolveThemedBackgrounds<State extends string>(
  states: readonly State[],
  textures: Record<State, pixi.Texture> | undefined,
  overrides: Partial<Record<State, pixi.Container | undefined>> | undefined,
): Partial<Record<State, pixi.Container>> {
  return Object.fromEntries(
    states.map((state) => [
      state,
      overrides?.[state] ?? (textures && createBackground(textures[state])),
    ]),
  ) as Partial<Record<State, pixi.Container>>;
}

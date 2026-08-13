import {type UiTheme, type UiThemeDescription} from '../ui/UiTheme.js';
import {type GameAssets} from './GameAssets.js';

/**
 * A UI theme with a two-phase lifecycle: created from a description that only names atlas frames
 * (safe to evaluate at module load), then resolved into textures once assets are loaded.
 */
export class GameTheme {
  /** Description to resolve; released after resolution so it can be garbage collected. */
  #description: UiThemeDescription | null;

  /** Resolved theme; `null` until `resolve` runs. */
  #resolved: UiTheme | null = null;

  constructor(description: UiThemeDescription) {
    this.#description = description;
  }

  /** Resolved theme with textures in place of texture references. */
  get resolved(): UiTheme {
    if (this.#resolved === null) {
      throw new Error("Theme isn't resolved yet!");
    }

    return this.#resolved;
  }

  /**
   * Resolves the description into textures. Used after the default bundle loads, so every frame
   * named in the description must live in that bundle.
   */
  resolve(assets: GameAssets): this {
    if (this.#description === null) {
      throw new Error('Theme is already resolved!');
    }

    this.#resolved = Object.fromEntries(
      Object.entries(this.#description).map(([group, entries]) => [
        group,
        Object.fromEntries(
          Object.entries(entries as Record<string, unknown>).map(([key, value]) => [
            key,
            Array.isArray(value) ? assets.texture(value[0] as never, value[1] as string) : value,
          ]),
        ),
      ]),
    ) as UiTheme;
    this.#description = null;

    return this;
  }
}

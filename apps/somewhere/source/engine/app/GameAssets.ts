import * as pixi from 'pixi.js';

import {audioBufferAsset} from '../../pixi-tools/audioBufferAsset.js';
import {tiledTilemapAsset} from '../../pixi-tools/tiledTilemapAsset.js';
import {tiledTilesetAsset} from '../../pixi-tools/tiledTilesetAsset.js';
import {type GameAssetBundle} from './GameAssetBundle.js';

// Loader plumbing lives with the loader owner: these parsers must be
// registered before pixi.Assets is initialized, and this module's class is
// the only thing that initializes it.
pixi.extensions.add(tiledTilesetAsset);
pixi.extensions.add(tiledTilemapAsset);
pixi.extensions.add(audioBufferAsset);

type GameAssetGroup = Exclude<keyof GameAssetBundle, 'name'>;

const ASSET_GROUPS = [
  'fonts',
  'sounds',
  'spritesheets',
  'tilemaps',
  'tilesets',
] as const satisfies readonly GameAssetGroup[];

// Distributes over the bundle union so each bundle contributes its own keys.
type BundleAssetNames<Bundle, Group extends GameAssetGroup> =
  Bundle extends GameAssetBundle ? keyof NonNullable<Bundle[Group]> & string : never;

type AssetNames<
  Bundles extends readonly GameAssetBundle[],
  Group extends GameAssetGroup,
> = BundleAssetNames<Bundles[number], Group>;

export type GameAssetsOptions<Bundles extends readonly GameAssetBundle[]> = {
  bundles: Bundles;
};

/**
 * One owner for the asset manifest, pixi.Assets initialization, bundle
 * loading and fail-loud typed lookup. Asset names are compile-time typed,
 * inferred from the manifest passed to the constructor; kinds are declared by
 * grouping (`spritesheets`, `sounds`, ...) because pixi detects `.json` kinds
 * by file content, which the type system cannot see. Only kinds that game
 * code reads directly get accessors: `fonts`, `tilemaps` and `tilesets`
 * exist for loading and bundle checks only.
 */
export class GameAssets<
  // The readonly default is load-bearing: `const` inference types the
  // constructor argument as a readonly tuple, and GameAssets<readonly [...]>
  // is not assignable to GameAssets<GameAssetBundle[]>, so a mutable default
  // would make every concrete instance unassignable to the bare GameAssets.
  const Bundles extends readonly GameAssetBundle[] = readonly GameAssetBundle[],
> {
  readonly #bundles: Bundles;

  constructor({bundles}: GameAssetsOptions<Bundles>) {
    this.#bundles = bundles;
  }

  async init(): Promise<void> {
    await pixi.Assets.init({
      manifest: {
        bundles: this.#bundles.map((bundle) => ({
          name: bundle.name,
          assets: ASSET_GROUPS.flatMap((group) =>
            Object.entries(bundle[group] ?? {}).map(([alias, src]) => ({alias, src})),
          ),
        })),
      },
    });
  }

  // pixi.Assets.loadBundle resolves silently for unknown bundle ids
  // (Resolver.resolveBundle skips them, despite its JSDoc @throws), so
  // without this check a typo'd name loads nothing and surfaces nowhere.
  async loadBundles(names: string[]): Promise<void> {
    for (let name of names) {
      if (!this.#bundles.some((bundle) => bundle.name === name)) {
        throw new Error(`Asset bundle "${name}" doesn't exist!`);
      }
    }

    await pixi.Assets.loadBundle(names);
  }

  backgroundLoadAll(): void {
    void pixi.Assets.backgroundLoadBundle(this.#bundles.map((bundle) => bundle.name));
  }

  areBundlesLoaded(names: string[]): boolean {
    for (let name of names) {
      let bundle = this.#bundles.find((candidate) => candidate.name === name);

      // An unknown bundle reports false before touching pixi.Assets.cache.
      if (!bundle) {
        return false;
      }

      for (let group of ASSET_GROUPS) {
        for (let assetName of Object.keys(bundle[group] ?? {})) {
          if (!pixi.Assets.cache.has(assetName)) {
            return false;
          }
        }
      }
    }

    return true;
  }

  texture(sheet: AssetNames<Bundles, 'spritesheets'>, frame: string): pixi.Texture {
    let texture = this.#spritesheet(sheet).textures[frame];

    if (!texture) {
      throw new Error(`Texture "${frame}" not found in the "${sheet}" spritesheet!`);
    }

    return texture;
  }

  sound(name: AssetNames<Bundles, 'sounds'>): AudioBuffer {
    // Gating on cache.has keeps pixi's console warning off the miss path.
    if (!pixi.Assets.cache.has(name)) {
      throw new Error(`Sound "${name}" wasn't loaded!`);
    }

    let sound = pixi.Assets.get<unknown>(name);

    // Grouping is type-level only, so the runtime kind is verified here: a
    // file filed under the wrong group fails precisely, not as a confusing
    // missing-frame error or a mistyped return value.
    if (!(sound instanceof AudioBuffer)) {
      throw new Error(`Asset "${name}" is not a sound!`);
    }

    return sound;
  }

  #spritesheet(name: string): pixi.Spritesheet {
    if (!pixi.Assets.cache.has(name)) {
      throw new Error(`Spritesheet "${name}" wasn't loaded!`);
    }

    let spritesheet = pixi.Assets.get<unknown>(name);

    if (!(spritesheet instanceof pixi.Spritesheet)) {
      throw new Error(`Asset "${name}" is not a spritesheet!`);
    }

    return spritesheet as pixi.Spritesheet;
  }
}

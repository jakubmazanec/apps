import * as pixi from 'pixi.js';

import {audioBufferAsset} from '../../pixi-tools/audioBufferAsset.js';
import {spritesetAsset} from '../../pixi-tools/spritesetAsset.js';
import {tiledTilemapAsset} from '../../pixi-tools/tiledTilemapAsset.js';
import {tiledTilesetAsset} from '../../pixi-tools/tiledTilesetAsset.js';
import {Spriteset} from '../graphics/Spriteset.js';
import {type GameAssetBundle} from './GameAssetBundle.js';

pixi.extensions.add(tiledTilesetAsset);
pixi.extensions.add(tiledTilemapAsset);
pixi.extensions.add(audioBufferAsset);
pixi.extensions.add(spritesetAsset);

type GameAssetGroup = Exclude<keyof GameAssetBundle, 'name'>;

const ASSET_GROUPS = [
  'fonts',
  'sounds',
  'spritesets',
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
 * A process-lifetime class used as a singleton that handles all assets loading ansd is used for
 * getting assets to their consumers.
 */
export class GameAssets<
  const Bundles extends readonly GameAssetBundle[] = readonly GameAssetBundle[],
> {
  /** TBD */
  readonly #bundleNames: Set<string>;

  /** TBD */
  readonly #bundles: Bundles;

  constructor({bundles}: GameAssetsOptions<Bundles>) {
    this.#bundles = bundles;
    this.#bundleNames = new Set(bundles.map((bundle) => bundle.name));
  }

  /** TBD */
  areBundlesLoaded(names: string[]): boolean {
    for (let name of names) {
      if (!this.#bundleNames.has(name)) {
        throw new Error(`Asset bundle "${name}" doesn't exist!`);
      }

      let bundle = this.#bundles.find((candidate) => candidate.name === name);

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

  /** TBD */
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

  /** TBD */
  loadAllBundlesInBackground(): void {
    void pixi.Assets.backgroundLoadBundle([...this.#bundleNames]);
  }

  /** TBD */
  async loadBundles(names: string[]): Promise<void> {
    for (let name of names) {
      if (!this.#bundleNames.has(name)) {
        throw new Error(`Asset bundle "${name}" doesn't exist!`);
      }
    }

    await pixi.Assets.loadBundle(names);
  }

  /** TBD */
  sound(name: AssetNames<Bundles, 'sounds'>): AudioBuffer {
    if (!pixi.Assets.cache.has(name)) {
      throw new Error(`Sound "${name}" wasn't loaded!`);
    }

    let sound = pixi.Assets.get<unknown>(name);

    if (!(sound instanceof AudioBuffer)) {
      throw new Error(`Asset "${name}" is not a sound!`);
    }

    return sound;
  }

  /** TBD */
  spriteset(name: AssetNames<Bundles, 'spritesets'>): Spriteset {
    return this.#resolveSpriteset(name);
  }

  /** TBD */
  texture(spriteset: AssetNames<Bundles, 'spritesets'>, frame: string): pixi.Texture {
    let texture = this.#resolveSpriteset(spriteset).textures[frame];

    if (!texture) {
      throw new Error(`Texture "${frame}" not found in the "${spriteset}" spriteset!`);
    }

    return texture;
  }

  // The cache check precedes Assets.get so a miss never triggers pixi's cache
  // warning.
  /** TBD */
  #resolveSpriteset(name: string): Spriteset {
    if (!pixi.Assets.cache.has(name)) {
      throw new Error(`Spriteset "${name}" wasn't loaded!`);
    }

    let asset = pixi.Assets.get<unknown>(name);

    if (!(asset instanceof Spriteset)) {
      throw new Error(`Asset "${name}" is not a spriteset!`);
    }

    return asset;
  }
}

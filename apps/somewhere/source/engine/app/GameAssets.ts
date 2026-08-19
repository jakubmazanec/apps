import * as pixi from 'pixi.js';

import {Spriteset} from '../graphics/Spriteset.js';
import {audioBufferAsset} from '../pixi-tools/audioBufferAsset.js';
import {spritesetAsset} from '../pixi-tools/spritesetAsset.js';
import {tiledTilemapAsset} from '../pixi-tools/tiledTilemapAsset.js';
import {tiledTilesetAsset} from '../pixi-tools/tiledTilesetAsset.js';
import {type GameAssetBundle} from './GameAssetBundle.js';
import {GameAssetGroup} from './GameAssetGroup.js';
import {type GameAssetNames} from './GameAssetNames.js';
import {type GameAssetsOptions} from './GameAssetsOptions.js';

pixi.extensions.add(tiledTilesetAsset);
pixi.extensions.add(tiledTilemapAsset);
pixi.extensions.add(audioBufferAsset);
pixi.extensions.add(spritesetAsset);

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

      for (let group of GameAssetGroup) {
        for (let assetName of Object.keys(bundle[group] ?? {})) {
          if (!pixi.Assets.cache.has(assetName)) {
            return false;
          }
        }
      }
    }

    return true;
  }

  // TODO: find if linter rule can be set up so init is always after constructor
  /** TBD */
  async init(): Promise<void> {
    await pixi.Assets.init({
      manifest: {
        bundles: this.#bundles.map((bundle) => ({
          name: bundle.name,
          assets: GameAssetGroup.flatMap((group) =>
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
  sound(name: GameAssetNames<Bundles[number], 'sounds'>): AudioBuffer {
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
  spriteset(name: GameAssetNames<Bundles[number], 'spritesets'>): Spriteset {
    return this.#resolveSpriteset(name);
  }

  /** TBD */
  texture(spriteset: GameAssetNames<Bundles[number], 'spritesets'>, frame: string): pixi.Texture {
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

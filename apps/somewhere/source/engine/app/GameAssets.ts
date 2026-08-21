import * as pixi from 'pixi.js';

import {Spriteset} from '../graphics/Spriteset.js';
import {audioBufferAsset} from '../pixi-tools/audioBufferAsset.js';
import {spritesetAsset} from '../pixi-tools/spritesetAsset.js';
import {tiledTilemapAsset} from '../pixi-tools/tiledTilemapAsset.js';
import {tiledTilesetAsset} from '../pixi-tools/tiledTilesetAsset.js';
import {Tilemap} from '../tiled/Tilemap.js';
import {Tileset} from '../tiled/Tileset.js';
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
  readonly #bundles: Bundles;

  constructor({bundles}: GameAssetsOptions<Bundles>) {
    this.#bundles = bundles;
  }

  /** Initializes the instance. */
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

  /** Returns `true` if all specified bundles are loaded. */
  areBundlesLoaded(bundleNames: string[]): boolean {
    for (let name of bundleNames) {
      let bundle = this.#bundles.find((candidate) => candidate.name === name);

      if (!bundle) {
        throw new Error(`Asset bundle "${name}" doesn't exist!`);
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

  /** Loads all bundles in the bavkground. */
  loadAllBundlesInBackground(): void {
    void pixi.Assets.backgroundLoadBundle(this.#bundles.map((bundle) => bundle.name));
  }

  /** Loads specified bundles. */
  async loadBundles(bundleNames: string[]): Promise<void> {
    for (let name of bundleNames) {
      if (!this.#bundles.some((candidate) => candidate.name === name)) {
        throw new Error(`Asset bundle "${name}" doesn't exist!`);
      }
    }

    await pixi.Assets.loadBundle(bundleNames);
  }

  /** Returns sound. */
  sound(soundName: GameAssetNames<Bundles[number], 'sounds'>): AudioBuffer {
    if (!pixi.Assets.cache.has(soundName)) {
      throw new Error(`Sound "${soundName}" wasn't loaded!`);
    }

    let sound = pixi.Assets.get<unknown>(soundName);

    if (!(sound instanceof AudioBuffer)) {
      throw new Error(`Asset "${soundName}" is not a sound!`);
    }

    return sound;
  }

  /** Returns spriteset. */
  spriteset(spritesetName: GameAssetNames<Bundles[number], 'spritesets'>): Spriteset {
    if (!pixi.Assets.cache.has(spritesetName)) {
      throw new Error(`Spriteset "${spritesetName}" wasn't loaded!`);
    }

    let asset = pixi.Assets.get<unknown>(spritesetName);

    if (!(asset instanceof Spriteset)) {
      throw new Error(`Asset "${spritesetName}" is not a spriteset!`);
    }

    return asset;
  }

  /** Returns tilemap. */
  tilemap(tilemapName: GameAssetNames<Bundles[number], 'tilemaps'>): Tilemap {
    if (!pixi.Assets.cache.has(tilemapName)) {
      throw new Error(`Tilemap "${tilemapName}" wasn't loaded!`);
    }

    let asset = pixi.Assets.get<unknown>(tilemapName);

    if (!(asset instanceof Tilemap)) {
      throw new Error(`Asset "${tilemapName}" is not a tilemap!`);
    }

    return asset;
  }

  /** Returns tileset. */
  tileset(tilesetName: GameAssetNames<Bundles[number], 'tilesets'>): Tileset {
    if (!pixi.Assets.cache.has(tilesetName)) {
      throw new Error(`Tileset "${tilesetName}" wasn't loaded!`);
    }

    let asset = pixi.Assets.get<unknown>(tilesetName);

    if (!(asset instanceof Tileset)) {
      throw new Error(`Asset "${tilesetName}" is not a tileset!`);
    }

    return asset;
  }
}

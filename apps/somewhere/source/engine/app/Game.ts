import {type EventEmitter} from 'eventemitter3';
import * as pixi from 'pixi.js';

// import {CRTFilter} from 'pixi-filters';
import {tiledTilemapAsset} from '../../pixi-tools/tiledTilemapAsset.js';
import {tiledTilesetAsset} from '../../pixi-tools/tiledTilesetAsset.js';
import {type GameScreen, type Renderable} from './GameScreen.js';

export type GameAssetBundleAsset = {
  name: string;
  sources: string[];
};

export type GameAssetBundle = {
  name: string;
  assets: GameAssetBundleAsset[];
};

export type GameOptions = {
  assetBundles: GameAssetBundle[];
};

export class Game {
  assetBundles: GameAssetBundle[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  screens: Array<GameScreen<any>> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  loadingScreen?: GameScreen<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  currentScreen: GameScreen<any> | null = null;

  readonly app: pixi.Application;
  readonly view: pixi.Container = new pixi.Container();
  private readonly interactionView: pixi.Container = new pixi.Container();

  ref: React.RefObject<HTMLElement | null> | null = null;

  constructor({assetBundles}: GameOptions) {
    this.assetBundles = assetBundles;
    this.app = new pixi.Application();
  }

  async init() {
    await this.app.init({
      // resolution: Math.max(window.devicePixelRatio, 2),
      resolution: 1,
      backgroundColor: 0x000000,
      antialias: false,
      eventMode: 'passive',
      preference: 'webgl',
    });

    this.app.stage.addChild(this.view);
    this.app.stage.addChild(this.interactionView);

    this.interactionView.eventMode = 'static';
    this.interactionView.hitArea = new pixi.Rectangle();

    pixi.TextureSource.defaultOptions.scaleMode = 'nearest';

    pixi.extensions.add(tiledTilesetAsset);
    pixi.extensions.add(tiledTilemapAsset);

    await pixi.Assets.init({
      manifest: {
        bundles: this.assetBundles.map(({name, assets}) => ({
          name,
          assets: assets.map(({name, sources}) => ({
            alias: name,
            src: sources,
          })),
        })),
      },
    });
    await pixi.Assets.loadBundle(['default']);
    void pixi.Assets.backgroundLoadBundle(this.assetBundles.map((assetBundle) => assetBundle.name));

    // // TODO: make better abstraction
    // let filter = new CRTFilter({
    //   lineWidth: 4,
    //   lineContrast: 0.1,
    //   noise: 0.1,
    //   noiseSize: 0.1,
    //   vignetting: 0,
    //   time: 0,
    // });

    // app.stage.filters = [filter];

    // app.ticker.add((delta) => {
    //   filter.time += 0.5;

    //   if (filter.time > 1000) {
    //     filter.time = 0;
    //   }
    // });
  }

  on<T extends EventEmitter.EventNames<pixi.FederatedEventMap>>(
    event: T,
    fn: EventEmitter.EventListener<pixi.FederatedEventMap, T>,
  ): this {
    this.interactionView.on(event, fn, this);

    return this;
  }

  once<T extends EventEmitter.EventNames<pixi.FederatedEventMap>>(
    event: T,
    fn: EventEmitter.EventListener<pixi.FederatedEventMap, T>,
  ): this {
    this.interactionView.once(event, fn, this);

    return this;
  }

  off<T extends EventEmitter.EventNames<pixi.FederatedEventMap>>(
    event: T,
    fn?: EventEmitter.EventListener<pixi.FederatedEventMap, T>,
  ): this {
    this.interactionView.off(event, fn, this);

    return this;
  }

  isAssetBundleLoaded(bundle: string) {
    let assetBundle = this.assetBundles.find((b) => b.name === bundle);

    if (!assetBundle) {
      return false;
    }

    for (let asset of assetBundle.assets) {
      if (!pixi.Assets.cache.has(asset.name)) {
        return false;
      }
    }

    return true;
  }

  areAssetBundlesLoaded(bundles: string[]) {
    for (let name of bundles) {
      if (!this.isAssetBundleLoaded(name)) {
        return false;
      }
    }

    return true;
  }

  addRef(ref: React.RefObject<HTMLElement | null>) {
    if (!ref.current) {
      return this;
    }

    ref.current.append(this.app.canvas);
    window.addEventListener('resize', this.resize);

    this.ref = ref;

    this.resize();

    return this;
  }

  removeRef() {
    this.app.canvas.remove();
    window.removeEventListener('resize', this.resize);

    this.ref = null;

    return this;
  }

  resize = () => {
    if (!this.ref?.current) {
      return;
    }

    let width = Math.trunc(this.ref.current.clientWidth);
    let height = Math.trunc(this.ref.current.clientHeight);

    this.app.canvas.style.width = `${width}px`;
    this.app.canvas.style.height = `${height}px`;

    if (this.interactionView.hitArea) {
      let hitArea = this.interactionView.hitArea as pixi.Rectangle;

      hitArea.x = 0;
      hitArea.y = 0;
      hitArea.width = width;
      hitArea.height = height;
    }

    window.scrollTo(0, 0);
    this.app.renderer.resize(width, height);

    if (this.currentScreen?.view.parent) {
      this.currentScreen.resize();
    }

    if (this.loadingScreen?.view.parent) {
      this.loadingScreen.resize();
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  addLoadingScreen(gameScreen: GameScreen<any>) {
    this.loadingScreen = gameScreen;

    this.addScreen(this.loadingScreen);

    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  addScreen(gameScreen: GameScreen<any>) {
    if (!this.screens.includes(gameScreen)) {
      gameScreen.setGame(this);
      this.screens.push(gameScreen);
    }

    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  async showScreen(screen: GameScreen<any>) {
    if (this.screens.includes(screen)) {
      // if there is a screen already created, hide it
      if (this.currentScreen) {
        this.removeFromView(this.currentScreen);
      }

      // load assets for the new screen, if available
      if (screen.assetBundles.length && !this.areAssetBundlesLoaded(screen.assetBundles)) {
        // if assets are not loaded yet, show loading screen, if there is one
        if (this.loadingScreen) {
          this.addToView(this.loadingScreen);
          this.loadingScreen.resize();
          await this.loadingScreen.show();
        }

        // load all assets required by this new screen
        await pixi.Assets.loadBundle(screen.assetBundles);

        // hide loading screen, if exists
        if (this.loadingScreen) {
          this.removeFromView(this.loadingScreen);
        }
      }

      this.currentScreen = screen;

      // add screen to stage
      this.addToView(screen);
      screen.resize();
      await screen.show();
    }

    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  async hideScreen(screen: GameScreen<any>) {
    await screen.hide();

    this.removeFromView(screen);

    return this;
  }

  addToView(renderable: Renderable) {
    this.view.addChild(renderable.view);
    this.app.ticker.add(renderable.update, renderable);
  }

  removeFromView(renderable: Renderable) {
    this.view.removeChild(renderable.view);
    this.app.ticker.remove(renderable.update, renderable);
  }
}

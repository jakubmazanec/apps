import {type EventEmitter} from 'eventemitter3';
import * as pixi from 'pixi.js';

// import {CRTFilter} from 'pixi-filters';
import {tiledTilemapAsset, tiledTilesetAsset} from '../pixi-tools.js';
import {type GameScreen} from './GameScreen.js';

export type GameAssetBundleAsset = {
  name: string;
  sources: string[];
};

export type GameAssetBundle = {
  name: string;
  assets: GameAssetBundleAsset[];
};

export type GameCreateOptions = {
  assetBundles: GameAssetBundle[];
};

export type GameOptions = {
  assetBundles: GameAssetBundle[];
  app: pixi.Application;
};

export class Game {
  assetBundles: GameAssetBundle[];

  screens: GameScreen[] = [];
  loadingScreen?: GameScreen;
  currentScreen: GameScreen | null = null;

  readonly app: pixi.Application;
  readonly view: pixi.Container = new pixi.Container();
  private readonly interactionView: pixi.Container = new pixi.Container();
  readonly ticker: pixi.Ticker;

  ref: React.RefObject<HTMLElement | null> | null = null;

  private constructor({assetBundles, app}: GameOptions) {
    this.assetBundles = assetBundles;
    this.app = app;
    this.ticker = app.ticker;

    app.stage.addChild(this.view);
    app.stage.addChild(this.interactionView);

    this.interactionView.eventMode = 'static';
    this.interactionView.hitArea = new pixi.Rectangle();
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

  static async create({assetBundles}: GameCreateOptions) {
    let app = new pixi.Application({
      // resolution: Math.max(window.devicePixelRatio, 2),
      resolution: 1,
      backgroundColor: 0x000000,
      antialias: false,
      // roundPixels: true,
      eventMode: 'passive',
    });

    pixi.extensions.add(tiledTilesetAsset);
    pixi.extensions.add(tiledTilemapAsset);

    // init assets
    await pixi.Assets.init({
      manifest: {
        bundles: assetBundles.map(({name, assets}) => ({
          name,
          assets: assets.map(({name, sources}) => ({
            alias: name,
            src: sources,
          })),
        })),
      },
    });
    await pixi.Assets.loadBundle(['default']);
    void pixi.Assets.backgroundLoadBundle(assetBundles.map((assetBundle) => assetBundle.name));

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

    return new this({
      assetBundles,
      app,
    });
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

    ref.current.appendChild(this.app.view as unknown as Node);
    window.addEventListener('resize', this.resize);

    this.ref = ref;

    this.resize();

    return this;
  }

  removeRef() {
    this.ref?.current?.removeChild(this.app.view as unknown as Node);
    window.removeEventListener('resize', this.resize);

    this.ref = null;

    return this;
  }

  resize = () => {
    if (this.ref?.current) {
      let width = Math.trunc(this.ref.current.clientWidth / 1);
      let height = Math.trunc(this.ref.current.clientHeight / 1);

      // const windowWidth = window.innerWidth;
      // const windowHeight = window.innerHeight;
      // const minWidth = designConfig.content.width;
      // const minHeight = designConfig.content.height;

      // // calculate renderer and canvas sizes based on current dimensions
      // const scaleX = windowWidth < minWidth ? minWidth / windowWidth : 1;
      // const scaleY = windowHeight < minHeight ? minHeight / windowHeight : 1;
      // const scale = scaleX > scaleY ? scaleX : scaleY;
      // const width = windowWidth * scale;
      // const height = windowHeight * scale;

      // update canvas style dimensions and scroll window up to avoid issues on mobile resize
      // this.app.renderer.view.style ??= {};
      this.app.renderer.view.style!.width = `${width * 1}px`;
      this.app.renderer.view.style!.height = `${height * 1}px`;
      // this.app.canvas.style.imageRendering = 'pixelated';

      if (this.interactionView.hitArea) {
        (this.interactionView.hitArea as pixi.Rectangle).x = 0;
        (this.interactionView.hitArea as pixi.Rectangle).y = 0;
        (this.interactionView.hitArea as pixi.Rectangle).width = width;
        (this.interactionView.hitArea as pixi.Rectangle).height = height;
      }

      window.scrollTo(0, 0);

      // update renderer and navigation screens dimensions
      this.app.renderer.resize(width, height);
      // navigation.init();
      // navigation.resize(width, height);
    }
  };

  addLoadingScreen(gameScreen: GameScreen) {
    this.loadingScreen = gameScreen;

    this.addScreen(this.loadingScreen);

    return this;
  }

  addScreen(gameScreen: GameScreen) {
    if (!this.screens.includes(gameScreen)) {
      this.screens.push(gameScreen);
    }

    return this;
  }

  async showScreen(screen: GameScreen) {
    if (this.screens.includes(screen)) {
      // if there is a screen already created, hide it
      if (this.currentScreen) {
        this.ticker.remove(this.currentScreen.update, this.currentScreen);
        this.currentScreen.view.parent.removeChild(this.currentScreen.view);
      }

      // load assets for the new screen, if available
      if (screen.assetBundles.length && !this.areAssetBundlesLoaded(screen.assetBundles)) {
        // if assets are not loaded yet, show loading screen, if there is one
        if (this.loadingScreen) {
          this.view.addChild(this.loadingScreen.view);
          this.ticker.add(this.loadingScreen.update, this.loadingScreen);
        }

        // await new Promise((resolve) => setTimeout(resolve, 5 * 1000));

        // load all assets required by this new screen
        await pixi.Assets.loadBundle(screen.assetBundles);

        // hide loading screen, if exists
        if (this.loadingScreen) {
          this.ticker.remove(this.loadingScreen.update, this.loadingScreen);
          this.loadingScreen.view.parent.removeChild(this.loadingScreen.view);
        }
      }

      // create the new screen and add to the stage
      this.currentScreen = screen;

      // add screen to stage
      this.view.addChild(screen.view);
      this.ticker.add(screen.update, screen);

      // // add screen's resize handler, if available
      // if (screen.resize) {
      //   // encapsulate resize in another function that can be removed later, to avoi scope issues with addEventListener

      //   this.currentScreenResize = () => screen.resize;

      //   // Trigger a first resize
      //   screen.resize(this._w, this._h);
      // }

      // // add update function if available
      // if (screen.update) {
      //   app.ticker.add(screen.update, screen);
      // }

      await screen.show();
    }

    return this;
  }

  async hideScreen(screen: GameScreen) {
    await screen.hide();

    // // unlink resize handler if exists
    // if (isOverlay) {
    //   this.currentOverlayResize && window.removeEventListener('resize', this.currentOverlayResize);
    // } else {
    //   this.currentScreenResize && window.removeEventListener('resize', this.currentScreenResize);
    // }

    // // unlink update function if method is available
    // if (screen.update) {
    //   app.ticker.remove(screen.update, screen);
    // }

    this.ticker.remove(screen.update, screen);
    screen.view.parent.removeChild(screen.view);

    return this;
  }
}

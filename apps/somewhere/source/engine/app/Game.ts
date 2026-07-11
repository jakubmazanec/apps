import {type EventEmitter} from 'eventemitter3';
import * as pixi from 'pixi.js';

// import {CRTFilter} from 'pixi-filters';
import {tiledTilemapAsset} from '../../pixi-tools/tiledTilemapAsset.js';
import {tiledTilesetAsset} from '../../pixi-tools/tiledTilesetAsset.js';
import {type GameScreen, type Renderable} from './GameScreen.js';

import '@pixi/layout';

// Tiled asset loaders are Pixi-library-global plugins (like the `@pixi/layout`
// import above), not Game-instance state, so they are registered once at module
// load rather than per Game.init().
pixi.extensions.add(tiledTilesetAsset);
pixi.extensions.add(tiledTilemapAsset);

export type GameAssetBundleAsset = {
  name: string;
  sources: string[];
};

export type GameAssetBundle = {
  name: string;
  assets: GameAssetBundleAsset[];
};

export type FocusCommand = 'activate' | 'down' | 'left' | 'next' | 'previous' | 'right' | 'up';

// Values are KeyboardEvent.code strings; a 'Shift+' prefix is the only
// supported modifier syntax (e.g. 'Shift+Tab').
export type FocusKeys = Partial<Record<FocusCommand, string[]>>;

export type GameOptions = {
  assetBundles: GameAssetBundle[];
  focusKeys?: FocusKeys;
};

type GameState = 'created' | 'destroyed' | 'initializing' | 'running' | 'transitioning';

export class Game {
  assetBundles: GameAssetBundle[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  screens: Array<GameScreen<any, any>> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  loadingScreen?: GameScreen<any, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  currentScreen: GameScreen<any, any> | null = null;

  readonly app: pixi.Application;
  readonly view: pixi.Container = new pixi.Container();

  ref: React.RefObject<HTMLElement | null> | null = null;

  readonly #focusCommands = new Map<string, FocusCommand>();

  // Game-lifetime resources (the addRef listeners), disposed once in destroy().
  // Teardown for the current canvas attachment. addRef replaces the stack
  // after disposing it because a DisposableStack cannot be reused.
  #disposables = new DisposableStack();

  // Lifecycle: created -> initializing -> running <-> transitioning ->
  // destroyed; a failed init() returns to created. The intermediate states
  // guard the async spans of init() and showScreen() against re-entry (the
  // game is a module singleton, so a route remount can call them mid-flight).
  #state: GameState = 'created';

  // Shim so the guards below keep reading as a capability check.
  get #isRunning() {
    return this.#state === 'running' || this.#state === 'transitioning';
  }

  constructor({assetBundles, focusKeys}: GameOptions) {
    this.assetBundles = assetBundles;

    for (let [command, codes] of Object.entries(focusKeys ?? {}) as Array<
      [FocusCommand, string[]]
    >) {
      for (let code of codes) {
        this.#focusCommands.set(code, command);
      }
    }

    this.app = new pixi.Application();
  }

  async init() {
    if (this.#state !== 'created') {
      return;
    }

    this.#state = 'initializing';

    try {
      await this.app.init({
        resolution: 1,
        backgroundColor: 0x000000,
        antialias: false,
        roundPixels: true,
        eventMode: 'passive',
        preference: 'webgl',
      });

      this.app.stage.addChild(this.view);

      this.view.layout = {width: this.app.screen.width, height: this.app.screen.height};
      this.view.eventMode = 'static';
      this.view.hitArea = new pixi.Rectangle();
      pixi.TextureSource.defaultOptions.scaleMode = 'nearest';

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
      void pixi.Assets.backgroundLoadBundle(
        this.assetBundles.map((assetBundle) => assetBundle.name),
      );

      this.#state = 'running';
    } finally {
      // Failure reopens the guard (success already moved on); nothing rolls
      // back a partially initialized app, so a retry after app.init()
      // succeeded would still double-init it.
      if (this.#state === 'initializing') {
        this.#state = 'created';
      }
    }

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
    if (!this.#isRunning) {
      return this;
    }

    this.view.on(event, fn, this);

    return this;
  }

  once<T extends EventEmitter.EventNames<pixi.FederatedEventMap>>(
    event: T,
    fn: EventEmitter.EventListener<pixi.FederatedEventMap, T>,
  ): this {
    if (!this.#isRunning) {
      return this;
    }

    this.view.once(event, fn, this);

    return this;
  }

  off<T extends EventEmitter.EventNames<pixi.FederatedEventMap>>(
    event: T,
    fn?: EventEmitter.EventListener<pixi.FederatedEventMap, T>,
  ): this {
    if (!this.#isRunning) {
      return this;
    }

    this.view.off(event, fn, this);

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
    if (!this.#isRunning) {
      return this;
    }

    if (!ref.current) {
      return this;
    }

    this.#disposables.dispose();
    this.#disposables = new DisposableStack();

    let handleResize = () => {
      if (!this.ref?.current) {
        return;
      }

      let cssWidth = Math.trunc(this.ref.current.clientWidth);
      let cssHeight = Math.trunc(this.ref.current.clientHeight);
      let pixelWidth = Math.round(cssWidth * window.devicePixelRatio);
      let pixelHeight = Math.round(cssHeight * window.devicePixelRatio);

      this.app.canvas.style.width = `${cssWidth}px`;
      this.app.canvas.style.height = `${cssHeight}px`;

      if (this.view.hitArea) {
        let hitArea = this.view.hitArea as pixi.Rectangle;

        hitArea.x = 0;
        hitArea.y = 0;
        hitArea.width = pixelWidth;
        hitArea.height = pixelHeight;
      }

      window.scrollTo(0, 0);
      this.app.renderer.resize(pixelWidth, pixelHeight);

      this.view.layout = {width: this.app.screen.width, height: this.app.screen.height}; // muste be called after renderer.resize() call, apparently

      if (this.currentScreen?.view.parent) {
        this.currentScreen.resize();
      }

      if (this.loadingScreen?.view.parent) {
        this.loadingScreen.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    this.#disposables.defer(() => {
      window.removeEventListener('resize', handleResize);
    });

    // Without a focusKeys map the whole focus system is inert; no listener,
    // zero cost for games that do not use it.
    if (this.#focusCommands.size > 0) {
      // Focus commands are routed to the current screen's UI root. While a DOM
      // input element has focus (a TextInput is editing), every key belongs to the
      // input, so navigation is suspended without any per-component key hooks.
      let handleKeyDown = (event: KeyboardEvent) => {
        if (event.target instanceof HTMLInputElement) {
          return;
        }

        let command = this.#focusCommands.get(event.shiftKey ? `Shift+${event.code}` : event.code);

        if (command === undefined) {
          return;
        }

        // Only mapped keys are consumed; this keeps Tab from escaping to the
        // browser while leaving every other key alone.
        event.preventDefault();

        if (!this.currentScreen?.view.parent) {
          return;
        }

        let {ui} = this.currentScreen;

        switch (command) {
          case 'activate': {
            ui.activate();

            break;
          }

          case 'down': {
            ui.moveFocus(command);

            break;
          }

          case 'left': {
            ui.moveFocus(command);

            break;
          }

          case 'next': {
            ui.focusNext();

            break;
          }

          case 'previous': {
            ui.focusPrevious();

            break;
          }

          case 'right': {
            ui.moveFocus(command);

            break;
          }

          case 'up': {
            ui.moveFocus(command);

            break;
          }

          // no default
        }
      };

      globalThis.addEventListener('keydown', handleKeyDown);
      this.#disposables.defer(() => {
        globalThis.removeEventListener('keydown', handleKeyDown);
      });
    }

    ref.current.append(this.app.canvas);
    this.app.canvas.style.imageRendering = 'pixelated';

    this.ref = ref;

    handleResize();

    return this;
  }

  removeRef() {
    if (!this.#isRunning) {
      return this;
    }

    this.#disposables.dispose();

    this.app.canvas.remove();

    this.ref = null;

    return this;
  }

  // Terminal teardown counterpart to init(). Game is a process-lifetime
  // singleton (it is not restartable like World), so destroy() exists for
  // correctness, test isolation, and the React unmount path. The screens are
  // module singletons reused across a dev StrictMode init->destroy->init cycle,
  // so they are intentionally left intact.
  destroy() {
    if (!this.#isRunning) {
      return this;
    }

    this.removeRef();
    this.app.stage.removeChild(this.view);
    this.app.destroy(true);

    this.#state = 'destroyed';

    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  addLoadingScreen(gameScreen: GameScreen<any, any>) {
    if (!this.#isRunning) {
      return this;
    }

    this.loadingScreen = gameScreen;

    this.addScreen(this.loadingScreen);

    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  addScreen(gameScreen: GameScreen<any, any>) {
    if (!this.#isRunning) {
      return this;
    }

    if (!this.screens.includes(gameScreen)) {
      gameScreen.setGame(this);
      this.screens.push(gameScreen);
    }

    return this;
  }

  // A failed bundle load rejects; callers must catch. The game stays usable
  // and the same call can be retried.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  async showScreen(screen: GameScreen<any, any>) {
    if (this.#state !== 'running') {
      return this;
    }

    // Re-showing the current screen (a React remount navigating back) resumes
    // where the player left off; mounting only re-attaches the view.
    if (this.currentScreen === screen) {
      return this;
    }

    if (!this.screens.includes(screen)) {
      return this;
    }

    this.#state = 'transitioning';

    try {
      // if there is a screen already created, hide it; hideScreen also clears
      // currentScreen, so a failed asset load below cannot leave a stale
      // pointer that would be hidden a second time on a later showScreen call
      if (this.currentScreen) {
        await this.hideScreen(this.currentScreen);
      }

      // load assets for the new screen, if available
      if (screen.assetBundles.length && !this.areAssetBundlesLoaded(screen.assetBundles)) {
        try {
          // if assets are not loaded yet, show loading screen, if there is one
          if (this.loadingScreen) {
            this.addToView(this.loadingScreen);
            this.loadingScreen.resize();
            await this.loadingScreen.show();
          }

          // load all assets required by this new screen
          await pixi.Assets.loadBundle(screen.assetBundles);
        } finally {
          // hide loading screen, if exists; its own error is swallowed so it
          // cannot mask a load failure
          if (this.loadingScreen) {
            await this.hideScreen(this.loadingScreen).catch(() => {});
          }
        }
      }

      this.currentScreen = screen;

      // add screen to stage
      this.addToView(screen);
      screen.resize();
      await screen.show();
    } finally {
      // destroy() can land mid-transition; only a still-live transition
      // returns to running.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- destroy() can flip the state to 'destroyed' during the awaits above, so it is not statically 'transitioning' here
      if (this.#state === 'transitioning') {
        this.#state = 'running';
      }
    }

    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
  async hideScreen(screen: GameScreen<any, any>) {
    if (!this.#isRunning) {
      return this;
    }

    await screen.hide();

    this.removeFromView(screen);

    // Hiding the current screen must clear the pointer, or showScreen's
    // resume early-return would leave the stage permanently blank on a
    // re-show. Conditional because the loading screen is also hidden through
    // here but is never the current screen, and an unconditional clear would
    // wrongly null the real current screen.
    if (this.currentScreen === screen) {
      this.currentScreen = null;
    }

    return this;
  }

  addToView(renderable: Renderable) {
    if (!this.#isRunning) {
      return;
    }

    this.view.addChild(renderable.view);
    this.app.ticker.add(renderable.update, renderable);
  }

  removeFromView(renderable: Renderable) {
    if (!this.#isRunning) {
      return;
    }

    this.view.removeChild(renderable.view);
    this.app.ticker.remove(renderable.update, renderable);
  }
}

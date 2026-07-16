import {type EventEmitter} from 'eventemitter3';
import * as pixi from 'pixi.js';

// import {CRTFilter} from 'pixi-filters';
import {audioBufferAsset} from '../../pixi-tools/audioBufferAsset.js';
import {tiledTilemapAsset} from '../../pixi-tools/tiledTilemapAsset.js';
import {tiledTilesetAsset} from '../../pixi-tools/tiledTilesetAsset.js';
import {isTextEntryTarget} from '../ui/isTextEntryTarget.js';
import {type ChoosePixelScale, defaultChoosePixelScale} from './ChoosePixelScale.js';
import {type FocusCommand} from './FocusCommand.js';
import {type GameAssetBundle} from './GameAssetBundle.js';
import {type GameOptions} from './GameOptions.js';
import {type GameScreen, type Renderable} from './GameScreen.js';
import {type GameState} from './GameState.js';

import '@pixi/layout';

pixi.extensions.add(tiledTilesetAsset);
pixi.extensions.add(tiledTilemapAsset);
pixi.extensions.add(audioBufferAsset);

/**
 * A process-lifetime class used as a singleton that represents
 */
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
  readonly #choosePixelScale: ChoosePixelScale;
  #pixelScale: number | null = null;

  /** Stack to register disposers that cleanup resources when needed. */
  #disposables = new DisposableStack();

  /** State of the Game instance; which aprt of its lifecycle it is currently in. */
  #state: GameState = 'created';

  get #isRunning() {
    return this.#state === 'running' || this.#state === 'transitioning';
  }

  /** Integer render scale chosen for this session; device px = art px × pixelScale. */
  get pixelScale(): number {
    if (this.#pixelScale === null) {
      throw new Error('pixelScale is not available before init()!');
    }

    return this.#pixelScale;
  }

  constructor({assetBundles, choosePixelScale, focusKeys}: GameOptions) {
    this.assetBundles = assetBundles;
    this.#choosePixelScale = choosePixelScale ?? defaultChoosePixelScale;

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
      // The canvas has no real size until the DOM ref attaches, long after init();
      // the viewport is available immediately and cannot be 0-sized the way a
      // hidden container can. Fixed per session: later resizes and DPR changes do
      // not re-run the chooser.
      let pixelScale = this.#choosePixelScale({
        width: window.innerWidth * window.devicePixelRatio,
        height: window.innerHeight * window.devicePixelRatio,
      });

      if (!Number.isInteger(pixelScale) || pixelScale < 1) {
        throw new Error(
          `Invalid pixelScale "${pixelScale}": the chooser must return an integer >= 1!`,
        );
      }

      this.#pixelScale = pixelScale;

      pixi.TextureSource.defaultOptions.scaleMode = 'nearest'; // Must be set before any texture load starts

      // Start the asset pipeline alongside app.init so the ~20-file default
      // bundle fetch is not serialized behind WebGL context creation.
      let assetsReady = pixi.Assets.init({
        manifest: {
          bundles: this.assetBundles.map(({name, assets}) => ({
            name,
            assets: assets.map(({name, sources}) => ({
              alias: name,
              src: sources,
            })),
          })),
        },
      }).then(async () => {
        await pixi.Assets.loadBundle(['default']);
      });

      let appReady = this.app
        .init({
          resolution: 1,
          backgroundColor: 0x000000,
          antialias: false,
          roundPixels: true,
          eventMode: 'passive',
          preference: 'webgl',
        })
        .then(() => {
          // stage/view setup depends on the renderer, so it must wait for
          // app.init — but not for the asset loads
          this.app.stage.addChild(this.view);

          // Everything inside the root (screens, world, UI) operates in art px;
          // device px exists only outside it.
          this.view.scale.set(this.pixelScale);

          this.view.layout = {
            width: this.app.screen.width / this.pixelScale,
            height: this.app.screen.height / this.pixelScale,
            // @pixi/layout composes a layout container's transform about its
            // transformOrigin, which defaults to '50%': a scaled root would
            // shift the whole scene by (1 - pixelScale)/2 of the box. Scale
            // about the top-left corner instead; the later width/height-only
            // assignments merge onto the style and keep this.
            transformOrigin: 0,
          };
          this.view.eventMode = 'static';
          this.view.hitArea = new pixi.Rectangle();

          // Engine contract: one frame advances world time by at most 100 ms
          // (maxElapsedMS = 1000 / minFPS), no matter how long the tab sat
          // backgrounded (rAF stops firing there) or how badly a frame
          // hitched. Pixi's Ticker defaults to minFPS = 10 already — pinned
          // explicitly so a ticker config change can't silently remove the
          // clamp. Timers fire at most once per update and tweens snap to
          // their end values, so a single 100 ms step is benign. (T1.9 moves
          // this into a world-level time object when timeScale lands.)
          this.app.ticker.minFPS = 10;
        });

      await Promise.all([appReady, assetsReady]);

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

      // The hit area and layout live in the view's local space — art px.
      if (this.view.hitArea) {
        let hitArea = this.view.hitArea as pixi.Rectangle;

        hitArea.x = 0;
        hitArea.y = 0;
        hitArea.width = pixelWidth / this.pixelScale;
        hitArea.height = pixelHeight / this.pixelScale;
      }

      window.scrollTo(0, 0);
      this.app.renderer.resize(pixelWidth, pixelHeight);

      this.view.layout = {
        width: this.app.screen.width / this.pixelScale,
        height: this.app.screen.height / this.pixelScale,
      }; // muste be called after renderer.resize() call, apparently

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
        if (isTextEntryTarget(event)) {
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

    // Can't show screen that hasn't been added.
    if (!this.screens.includes(screen)) {
      return this;
    }

    // Re-showing the current screen is no-op.
    if (this.currentScreen === screen) {
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
          // if assets are not loaded yet, show loading screen, if there is
          // one; overlapping is safe because the loading screen's own font
          // (monogram) comes from the always-preloaded 'default' bundle, so
          // its rendering never depends on the bundle being fetched here
          if (this.loadingScreen) {
            this.addToView(this.loadingScreen);
            this.loadingScreen.resize();

            // start the bundle fetch so it overlaps the loading screen's
            // show animation instead of waiting behind it; created after the
            // synchronous addToView/resize calls so a throw there cannot
            // strand the promise without a handler, and inside this try so
            // the finally below is already armed when a rejection can occur
            await Promise.all([
              this.loadingScreen.show(),
              pixi.Assets.loadBundle(screen.assetBundles),
            ]);
          } else {
            await pixi.Assets.loadBundle(screen.assetBundles);
          }
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

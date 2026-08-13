// import {type EventEmitter} from 'eventemitter3';
import {CRTFilter} from 'pixi-filters';
import * as pixi from 'pixi.js';

import {type GameInput} from '../input/GameInput.js';
import {type UiTheme} from '../ui/UiTheme.js';
import {type AnyErrorGameScreen} from './AnyErrorGameScreen.js';
import {type AnyGameScreen} from './AnyGameScreen.js';
import {type GameAssets} from './GameAssets.js';
import {type GameOptions} from './GameOptions.js';
import {type GameState} from './GameState.js';
import {type GameTheme} from './GameTheme.js';
import {getPixelScale} from './getPixelScale.js';
import {adoptInput} from './internals/adoptInput.js';
import {adoptResize} from './internals/adoptResize.js';
import {type Renderable} from './Renderable.js';

import '@pixi/layout';

/**
 * A process-lifetime class used as a singleton that represents the game.
 */
export class Game {
  /** Underlying Pixi.js app. */
  readonly app: pixi.Application = new pixi.Application();

  /** Current screen. */
  currentScreen: AnyGameScreen | null = null;

  /** Error screen. */
  errorScreen?: AnyErrorGameScreen;

  /** Loading scree. */
  loadingScreen?: AnyGameScreen;

  /** Integer representing how much is the rendering scaled up. */
  readonly pixelScale: number = getPixelScale(window.innerHeight * window.devicePixelRatio);

  /** Ref pointing to parent HTML element. */
  ref: React.RefObject<HTMLElement | null> | null = null;

  /** All screens. */
  readonly screens: AnyGameScreen[] = [];

  /** Primary view. */
  readonly view: pixi.Container = new pixi.Container();

  /** Assets. */
  readonly #assets: GameAssets;

  /** Stack to register disposers that cleanup resources when needed. */
  #disposables = new DisposableStack();

  /** Input. */
  readonly #input: GameInput;

  /** State of the Game instance; which part of its life cycle it is currently in. */
  #state: GameState = 'created';

  /** Theme. */
  readonly #theme: GameTheme;

  constructor({assets, input, theme}: GameOptions) {
    this.#assets = assets;
    this.#input = input;
    this.#theme = theme;
  }

  /** TBD */
  get isRunning() {
    return this.#state === 'running' || this.#state === 'transitioning';
  }

  /** Theme. */
  get theme(): UiTheme {
    return this.#theme.resolved;
  }

  /** Adds a screen to all screens and sets it as the error screen. */
  addErrorScreen(gameScreen: AnyErrorGameScreen) {
    if (!this.isRunning) {
      throw new Error('Game must be running!');
    }

    this.errorScreen = gameScreen;

    this.addScreen(this.errorScreen);

    return this;
  }

  /** Adds a screen to all screens and sets it as the loading screen. */
  addLoadingScreen(gameScreen: AnyGameScreen) {
    if (!this.isRunning) {
      throw new Error('Game must be running!');
    }

    this.loadingScreen = gameScreen;

    this.addScreen(this.loadingScreen);

    return this;
  }

  /** Adds a screen to all screens. */
  addScreen(gameScreen: AnyGameScreen) {
    if (!this.isRunning) {
      throw new Error('Game must be running!');
    }

    // Adding screen is idempotent.
    if (!this.screens.includes(gameScreen)) {
      this.screens.push(gameScreen);
      gameScreen.attach(this);
    }

    return this;
  }

  /** Adds renderable to view. */
  addToView(renderable: Renderable) {
    if (!this.isRunning) {
      throw new Error('Game must be running!');
    }

    this.view.addChild(renderable.view);
    this.app.ticker.add(renderable.update, renderable);
  }

  /** Destroys the game. */
  destroy() {
    if (!this.isRunning) {
      throw new Error('Game must be running!');
    }

    this.unmount();
    this.app.stage.removeChild(this.view);
    this.app.destroy(true);

    this.#state = 'destroyed';

    return this;
  }

  /** Initializes the game instance. */
  async init() {
    if (this.#state !== 'created') {
      throw new Error(
        `Game can't be initialized, it must be in "created" state (currently state is "${this.#state}")!`,
      );
    }

    this.#state = 'initializing';
    pixi.TextureSource.defaultOptions.scaleMode = 'nearest'; // Must be set before any texture load starts!

    // Start the asset pipeline alongside app.init().
    let assetsReady = this.#assets.init().then(async () => {
      await this.#assets.loadBundles(['default']);

      this.#theme.resolve(this.#assets);
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
      .then(() => {});

    await Promise.all([appReady, assetsReady]);
    this.#assets.loadAllBundlesInBackground();
    this.app.stage.addChild(this.view);
    this.view.scale.set(this.pixelScale);

    this.view.layout = {
      width: this.app.screen.width / this.pixelScale,
      height: this.app.screen.height / this.pixelScale,
      transformOrigin: 0, // @pixi/layout composes a layout container's transform about its transformOrigin, which defaults to '50%': a scaled root would shift the whole scene by (1 - pixelScale) / 2 of the box!
    };
    this.view.eventMode = 'static';
    this.view.hitArea = new pixi.Rectangle();
    this.app.ticker.minFPS = 10; // One frame advances world time by at most 100 ms; Pixi's Ticker defaults to minFPS = 10 already, but pinned explicitly.

    // TODO: make better abstraction
    let filter = new CRTFilter({
      lineWidth: this.pixelScale * 2,
      lineContrast: 0.08,
      noise: 0.1,
      noiseSize: 0.1,
      vignetting: 0,
      time: 0,
    });

    this.app.stage.filters = [filter];

    // TODO: use delta
    this.app.ticker.add((delta) => {
      filter.time += 0.4;

      if (filter.time > 1000) {
        filter.time = 0;
      }
    });

    this.#state = 'running';
  }

  /** Mounts the game using a ref. */
  mount(ref: React.RefObject<HTMLElement | null>) {
    if (!this.isRunning) {
      throw new Error('Game must be running!');
    }

    if (!ref.current) {
      return this;
    }

    this.#disposables.dispose();
    ref.current.append(this.app.canvas);

    this.#disposables = new DisposableStack();
    this.app.canvas.style.imageRendering = 'pixelated';
    this.ref = ref;

    adoptInput(this, this.#disposables, this.#input);
    adoptResize(this, this.#disposables);

    return this;
  }

  /** Removes renderable from view. */
  removeFromView(renderable: Renderable) {
    if (!this.isRunning) {
      throw new Error('Game must be running!');
    }

    this.view.removeChild(renderable.view);
    this.app.ticker.remove(renderable.update, renderable);
  }

  /** Shows screen. If some resources are not loaded, loadign screen is shown first. */
  async showScreen(screen: AnyGameScreen) {
    if (this.#state !== 'running') {
      throw new Error('Game must be running!');
    }

    // Can't show screen that hasn't been added.
    if (!this.screens.includes(screen)) {
      return this;
    }

    // Re-showing the current screen is no-op.
    if (this.currentScreen === screen) {
      return this;
    }

    try {
      this.#state = 'transitioning';

      // Cuurent screen must be hidden.
      if (this.currentScreen) {
        await this.#hideScreen(this.currentScreen);
      }

      // Load assets for the new screen, if needed.
      if (screen.assetBundles.length && !this.#assets.areBundlesLoaded(screen.assetBundles)) {
        // Show loading screen, if available.
        if (this.loadingScreen) {
          await this.#showScreen(this.loadingScreen, this.#assets.loadBundles(screen.assetBundles));
          await this.#hideScreen(this.loadingScreen);
        } else {
          await this.#assets.loadBundles(screen.assetBundles);
        }
      }

      await this.#showScreen(screen);
    } catch (error) {
      // eslint-disable-next-line no-console -- needed
      console.error(error);

      // Loading screen may be still atached after an error.
      if (this.loadingScreen?.view.parent) {
        this.removeFromView(this.loadingScreen);
      }

      // Or current screen may be still atached.
      if (this.currentScreen?.view.parent) {
        this.removeFromView(this.currentScreen);
      }

      this.currentScreen = null;

      if (this.errorScreen) {
        try {
          this.errorScreen.contents.showError(error);
          await this.#showScreen(this.errorScreen);
        } catch (errorScreenError) {
          // If error screen fails, print the error to the console.
          // eslint-disable-next-line no-console -- needed
          console.error(errorScreenError);
        }
      }
    }

    if (this.#state === 'transitioning') {
      this.#state = 'running';
    }

    return this;
  }

  /** Unmounts the game. */
  unmount() {
    if (!this.isRunning) {
      throw new Error('Game must be running!');
    }

    this.#disposables.dispose();
    this.app.canvas.remove();

    this.ref = null;

    return this;
  }

  /** TBD */
  async #hideScreen(screen: AnyGameScreen) {
    await screen.hide();
    this.removeFromView(screen);

    if (this.currentScreen === screen) {
      this.currentScreen = null;
    }

    return this;
  }

  /** TBD */
  async #showScreen(screen: AnyGameScreen, ...promisesToAwait: Array<Promise<unknown>>) {
    this.currentScreen = screen;

    this.addToView(screen);
    screen.resize();

    if (promisesToAwait.length) {
      await Promise.all([screen.show(), ...promisesToAwait]);
    } else {
      await screen.show();
    }

    return this;
  }

  // TODO: remove
  // on<T extends EventEmitter.EventNames<pixi.FederatedEventMap>>(
  //   event: T,
  //   fn: EventEmitter.EventListener<pixi.FederatedEventMap, T>,
  // ): this {
  //   if (!this.#isRunning) {
  //     return this;
  //   }

  //   this.view.on(event, fn, this);

  //   return this;
  // }

  // once<T extends EventEmitter.EventNames<pixi.FederatedEventMap>>(
  //   event: T,
  //   fn: EventEmitter.EventListener<pixi.FederatedEventMap, T>,
  // ): this {
  //   if (!this.#isRunning) {
  //     return this;
  //   }

  //   this.view.once(event, fn, this);

  //   return this;
  // }

  // off<T extends EventEmitter.EventNames<pixi.FederatedEventMap>>(
  //   event: T,
  //   fn?: EventEmitter.EventListener<pixi.FederatedEventMap, T>,
  // ): this {
  //   if (!this.#isRunning) {
  //     return this;
  //   }

  //   this.view.off(event, fn, this);

  //   return this;
  // }
}

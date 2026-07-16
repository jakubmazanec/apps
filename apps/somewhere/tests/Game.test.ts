import {afterEach, describe, expect, test, vi} from 'vitest';

vi.mock('pixi.js', () => ({
  Application: class Application {
    canvas = document.createElement('canvas');
    renderer = {
      resize: (width: number, height: number) => {
        this.screen.width = width;
        this.screen.height = height;
      },
    };
    screen = {width: 0, height: 0};
    stage = {addChild() {}, removeChild() {}};
    ticker = {add() {}, remove() {}};

    async init() {}

    destroy() {}
  },
  extensions: {add() {}},
  TextureSource: {defaultOptions: {}},
  Assets: {
    init: async () => {},
    loadBundle: async () => {},
    backgroundLoadBundle: async () => {},
  },
  Container: class Container {
    eventMode = 'auto';
    hitArea: unknown;

    #layout: Record<string, unknown> | undefined;

    get layout() {
      return this.#layout;
    }

    set layout(value: Record<string, unknown> | undefined) {
      // Real @pixi/layout merges each assignment onto the current style.
      this.#layout = value === undefined ? undefined : {...this.#layout, ...value};
    }

    scale = {
      x: 1,
      y: 1,
      set(value: number) {
        this.x = value;
        this.y = value;
      },
    };

    addChild() {}

    removeChild() {}

    on() {
      return this;
    }

    once() {
      return this;
    }

    off() {
      return this;
    }
  },
  Rectangle: class Rectangle {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
  },
}));

vi.mock('@pixi/layout', () => ({}));
vi.mock('../source/pixi-tools/tiledTilesetAsset.js', () => ({tiledTilesetAsset: {}}));
vi.mock('../source/pixi-tools/tiledTilemapAsset.js', () => ({tiledTilemapAsset: {}}));
vi.mock('../source/pixi-tools/audioBufferAsset.js', () => ({audioBufferAsset: {}}));

const {Game} = await import('../source/engine/app/Game.js');
const pixi = await import('pixi.js');
const {defaultChoosePixelScale} = await import('../source/engine/app/ChoosePixelScale.js');

const FOCUS_KEYS = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  next: ['Tab'],
  previous: ['Shift+Tab'],
  activate: ['Enter', 'Space'],
};

let cleanups: Array<() => void> = [];

async function createGame(focusKeys?: typeof FOCUS_KEYS) {
  let game = new Game({assetBundles: [], ...(focusKeys === undefined ? {} : {focusKeys})});
  let element = document.createElement('div');

  // init() owns the #disposables stack that addRef defers its listeners into,
  // so the game must be initialised before it is attached.
  await game.init();

  document.body.append(element);
  game.addRef({current: element});
  cleanups.push(() => {
    game.destroy();
    element.remove();
  });

  let ui = {
    moveFocus: vi.fn(),
    focusNext: vi.fn(),
    focusPrevious: vi.fn(),
    activate: vi.fn(),
  };

  game.currentScreen = {
    view: {parent: {}},
    ui,
    resize: vi.fn(),
  } as unknown as (typeof game)['currentScreen'];

  return {game, ui};
}

function createFakeScreen(assetBundles: string[] = []) {
  return {
    assetBundles,
    view: {},
    update() {},
    resize: vi.fn(),
    show: vi.fn(async () => {}),
    hide: vi.fn(async () => {}),
  };
}

function press(code: string, init: KeyboardEventInit = {}) {
  let event = new KeyboardEvent('keydown', {code, cancelable: true, ...init});

  window.dispatchEvent(event);

  return event;
}

describe('Game focus key routing', () => {
  afterEach(() => {
    for (let cleanup of cleanups) {
      cleanup();
    }

    cleanups = [];
    vi.restoreAllMocks();
  });

  test('routes arrow keys to moveFocus', async () => {
    let {ui} = await createGame(FOCUS_KEYS);

    press('ArrowUp');
    press('ArrowDown');
    press('ArrowLeft');
    press('ArrowRight');

    expect(ui.moveFocus.mock.calls).toEqual([['up'], ['down'], ['left'], ['right']]);
  });

  test('routes Tab and Shift+Tab to linear navigation', async () => {
    let {ui} = await createGame(FOCUS_KEYS);

    press('Tab');

    expect(ui.focusNext).toHaveBeenCalledTimes(1);
    expect(ui.focusPrevious).not.toHaveBeenCalled();

    press('Tab', {shiftKey: true});

    expect(ui.focusNext).toHaveBeenCalledTimes(1);
    expect(ui.focusPrevious).toHaveBeenCalledTimes(1);
  });

  test('routes Enter and Space to activate', async () => {
    let {ui} = await createGame(FOCUS_KEYS);

    press('Enter');
    press('Space');

    expect(ui.activate).toHaveBeenCalledTimes(2);
  });

  test('prevents default on mapped keys only', async () => {
    await createGame(FOCUS_KEYS);

    expect(press('Tab').defaultPrevented).toBeTruthy();
    expect(press('KeyA').defaultPrevented).toBeFalsy();
  });

  test('ignores keys while a DOM input element has focus', async () => {
    let {ui} = await createGame(FOCUS_KEYS);
    let input = document.createElement('input');

    document.body.append(input);

    let event = new KeyboardEvent('keydown', {code: 'Tab', cancelable: true, bubbles: true});

    input.dispatchEvent(event);

    expect(ui.focusNext).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBeFalsy();

    input.remove();
  });

  test('ignores keys while the current screen is hidden', async () => {
    let {game, ui} = await createGame(FOCUS_KEYS);

    (game.currentScreen as unknown as {view: {parent: unknown}}).view.parent = null;

    press('ArrowDown');

    expect(ui.moveFocus).not.toHaveBeenCalled();
  });

  test('is inert when focusKeys is omitted', async () => {
    let {ui} = await createGame();

    expect(press('Tab').defaultPrevented).toBeFalsy();
    expect(ui.focusNext).not.toHaveBeenCalled();
  });

  test('removeRef detaches the keydown listener', async () => {
    let {game, ui} = await createGame(FOCUS_KEYS);

    // Listeners pair with the canvas attachment, so a detached game is inert.
    game.removeRef();
    press('Tab');

    expect(ui.focusNext).not.toHaveBeenCalled();
  });

  test('destroy detaches the keydown listener', async () => {
    let {game, ui} = await createGame(FOCUS_KEYS);

    game.destroy();
    press('Tab');

    expect(ui.focusNext).not.toHaveBeenCalled();
  });

  test('addRef after removeRef does not stack duplicate keydown listeners', async () => {
    let {game, ui} = await createGame(FOCUS_KEYS);
    let element = document.createElement('div');

    document.body.append(element);
    game.removeRef();
    game.addRef({current: element});

    press('Tab');

    expect(ui.focusNext).toHaveBeenCalledTimes(1);

    element.remove();
  });

  test('addRef after removeRef does not stack duplicate resize handlers', async () => {
    let {game} = await createGame();
    let element = document.createElement('div');

    document.body.append(element);
    game.removeRef();
    game.addRef({current: element});

    let spy = vi.spyOn(game.app.renderer, 'resize');

    globalThis.dispatchEvent(new Event('resize'));

    expect(spy).toHaveBeenCalledTimes(1);

    element.remove();
  });

  test('destroy disposes the pixi application', async () => {
    let {game} = await createGame();
    let spy = vi.spyOn(game.app, 'destroy');

    game.destroy();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('destroy is idempotent', async () => {
    let {game} = await createGame();

    game.destroy();

    expect(() => game.destroy()).not.toThrow();
  });

  test('destroy before init is a safe no-op', () => {
    let game = new Game({assetBundles: []});

    expect(() => game.destroy()).not.toThrow();
  });

  test('init after destroy is a no-op', async () => {
    let {game} = await createGame();
    let spy = vi.spyOn(game.app, 'init');

    game.destroy();
    await game.init();

    expect(spy).not.toHaveBeenCalled();
  });

  test('a second init() during the async span does not double-run initialization', async () => {
    let game = new Game({assetBundles: []});
    let spy = vi.spyOn(game.app, 'init');

    cleanups.push(() => {
      game.destroy();
    });

    // Both calls overlap: the second starts while the first is still awaiting,
    // which is the route-remount re-entrancy the initializing state guards.
    await Promise.all([game.init(), game.init()]);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('init after a successful init is a no-op', async () => {
    let {game} = await createGame();
    let spy = vi.spyOn(game.app, 'init');

    await game.init();

    expect(spy).not.toHaveBeenCalled();
  });

  test('addRef before init is a no-op', () => {
    let game = new Game({assetBundles: []});
    let element = document.createElement('div');

    game.addRef({current: element});

    expect(element.children).toHaveLength(0);
  });

  test('renderer methods are a no-op after destroy', async () => {
    let {game} = await createGame();
    let spy = vi.spyOn(game.app.ticker, 'add');

    game.destroy();
    game.addToView({view: {}, update() {}} as unknown as Parameters<(typeof game)['addToView']>[0]);

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Game screen lifecycle', () => {
  afterEach(() => {
    for (let cleanup of cleanups) {
      cleanup();
    }

    cleanups = [];
    vi.restoreAllMocks();
  });

  test('showScreen hides the outgoing screen before removing it', async () => {
    let {game} = await createGame();
    let first = createFakeScreen();
    let second = createFakeScreen();

    game.currentScreen = null; // createGame's ui fake has no hide()
    game.screens.push(first as unknown as (typeof game.screens)[number]);
    game.screens.push(second as unknown as (typeof game.screens)[number]);

    await game.showScreen(first as never);

    let removeSpy = vi.spyOn(game.app.ticker, 'remove');

    await game.showScreen(second as never);

    expect(first.hide).toHaveBeenCalledTimes(1);
    expect(Math.min(...first.hide.mock.invocationCallOrder)).toBeLessThan(
      Math.min(...removeSpy.mock.invocationCallOrder),
    );
  });

  test('showScreen routes the loading screen through hide()', async () => {
    let {game} = await createGame();
    let loading = createFakeScreen();
    let screen = createFakeScreen(['game']); // not loaded, so the loading branch runs

    game.currentScreen = null;
    game.loadingScreen = loading as never;
    game.screens.push(screen as unknown as (typeof game.screens)[number]);

    await game.showScreen(screen as never);

    expect(loading.show).toHaveBeenCalledTimes(1);
    expect(loading.hide).toHaveBeenCalledTimes(1);
  });

  test('showScreen with the current screen resumes without a hide and show cycle', async () => {
    let {game} = await createGame();
    let screen = createFakeScreen();

    game.currentScreen = null;
    game.screens.push(screen as unknown as (typeof game.screens)[number]);

    await game.showScreen(screen as never);
    await game.showScreen(screen as never);

    expect(screen.hide).not.toHaveBeenCalled();
    expect(screen.show).toHaveBeenCalledTimes(1);
  });

  test('an external hideScreen clears currentScreen so the same screen can be re-shown', async () => {
    let {game} = await createGame();
    let screen = createFakeScreen();

    game.currentScreen = null;
    game.screens.push(screen as unknown as (typeof game.screens)[number]);

    await game.showScreen(screen as never);
    await game.hideScreen(screen as never);

    expect(game.currentScreen).toBeNull();

    // Without the cleared pointer this would hit showScreen's resume
    // early-return and leave the stage blank.
    await game.showScreen(screen as never);

    expect(game.currentScreen).toBe(screen);
    expect(screen.show).toHaveBeenCalledTimes(2);
  });

  test('hiding a non-current screen (the loading screen) leaves currentScreen intact', async () => {
    let {game} = await createGame();
    let loading = createFakeScreen();
    let screen = createFakeScreen();

    game.currentScreen = null;
    game.loadingScreen = loading as never;
    game.screens.push(screen as unknown as (typeof game.screens)[number]);

    await game.showScreen(screen as never);
    await game.hideScreen(loading as never);

    expect(game.currentScreen).toBe(screen);
  });

  test('a failed bundle load rejects, hides the loading screen, and can be retried', async () => {
    let {game} = await createGame();
    let loading = createFakeScreen();
    let screen = createFakeScreen(['game']);

    game.currentScreen = null;
    game.loadingScreen = loading as never;
    game.screens.push(screen as unknown as (typeof game.screens)[number]);

    vi.spyOn(pixi.Assets, 'loadBundle').mockRejectedValueOnce(new Error('network'));

    await expect(game.showScreen(screen as never)).rejects.toThrow('network');

    // The failed attempt left no stale state behind.
    expect(loading.hide).toHaveBeenCalledTimes(1);
    expect(game.currentScreen).toBeNull();
    expect(screen.show).not.toHaveBeenCalled();

    // The guard reopened, so the retry runs the whole transition again.
    await game.showScreen(screen as never);

    expect(game.currentScreen).toBe(screen);
    expect(screen.show).toHaveBeenCalledTimes(1);
    expect(loading.hide).toHaveBeenCalledTimes(2);
  });

  test('showScreen starts the bundle load before the loading screen finishes showing', async () => {
    let {game} = await createGame();
    let loading = createFakeScreen();
    let screen = createFakeScreen(['game']);
    let loadBundleSpy = vi.spyOn(pixi.Assets, 'loadBundle');
    let resolveShow!: () => void;

    vi.spyOn(loading, 'show').mockImplementation(
      async () =>
        new Promise<void>((resolve) => {
          resolveShow = resolve;
        }),
    );

    game.currentScreen = null;
    game.loadingScreen = loading as never;
    game.screens.push(screen as unknown as (typeof game.screens)[number]);

    let transition = game.showScreen(screen as never);

    // The bundle load must already be in flight while the loading screen's
    // show is still pending; if this fails, the transition re-serialized.
    expect(loading.show).toHaveBeenCalledTimes(1);
    expect(loadBundleSpy).toHaveBeenCalledTimes(1);

    resolveShow();
    await transition;

    expect(game.currentScreen).toBe(screen);
    expect(loading.hide).toHaveBeenCalledTimes(1);
  });

  test('a second showScreen during an in-flight transition is a no-op', async () => {
    let {game} = await createGame();
    let loading = createFakeScreen();
    let screen = createFakeScreen(['game']);
    let spy = vi.spyOn(pixi.Assets, 'loadBundle');

    game.currentScreen = null;
    game.loadingScreen = loading as never;
    game.screens.push(screen as unknown as (typeof game.screens)[number]);

    // Both calls overlap: the second starts while the first is still awaiting
    // the bundle load, which is the re-entrancy the transitioning state
    // guards against.
    await Promise.all([game.showScreen(screen as never), game.showScreen(screen as never)]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.show).toHaveBeenCalledTimes(1);
  });
});

describe('Game init pipeline overlap', () => {
  afterEach(() => {
    for (let cleanup of cleanups) {
      cleanup();
    }

    cleanups = [];
    vi.restoreAllMocks();
  });

  test('init starts the asset pipeline before app.init resolves', async () => {
    let game = new Game({assetBundles: []});
    let resolveAppInit!: () => void;

    cleanups.push(() => {
      game.destroy();
    });

    vi.spyOn(game.app, 'init').mockImplementation(
      async () =>
        new Promise<void>((resolve) => {
          resolveAppInit = resolve;
        }),
    );

    let assetsInitSpy = vi.spyOn(pixi.Assets, 'init');
    let initPromise = game.init();

    // Assets.init must already have been called while app.init is still
    // pending; if this fails, the two pipelines re-serialized.
    expect(assetsInitSpy).toHaveBeenCalledTimes(1);

    resolveAppInit();
    await initPromise;
  });

  test('scaleMode is nearest by the time the default bundle load starts', async () => {
    let game = new Game({assetBundles: []});
    let scaleModeAtLoad: unknown;

    cleanups.push(() => {
      game.destroy();
    });

    // defaultOptions is a module-global shared across tests; clearing it
    // proves init() itself set scaleMode before the load, not a prior test.
    (pixi.TextureSource.defaultOptions as {scaleMode?: unknown}).scaleMode = undefined;

    vi.spyOn(pixi.Assets, 'loadBundle').mockImplementation(async () => {
      scaleModeAtLoad = pixi.TextureSource.defaultOptions.scaleMode;
    });

    await game.init();

    expect(scaleModeAtLoad).toBe('nearest');
  });
});

describe('Game ticker configuration', () => {
  afterEach(() => {
    for (let cleanup of cleanups) {
      cleanup();
    }

    cleanups = [];
    vi.restoreAllMocks();
  });

  test('init pins the ticker clamp: minFPS = 10 caps one frame step at 100 ms', async () => {
    let game = new Game({assetBundles: []});

    cleanups.push(() => {
      game.destroy();
    });

    await game.init();

    expect(game.app.ticker.minFPS).toBe(10);
  });
});

describe('Game pixelScale', () => {
  afterEach(() => {
    for (let cleanup of cleanups) {
      cleanup();
    }

    cleanups = [];
    vi.restoreAllMocks();
  });

  test('pixelScale access before init throws', () => {
    let game = new Game({assetBundles: []});

    expect(() => game.pixelScale).toThrow('pixelScale is not available before init()!');
  });

  test('init runs the chooser exactly once with the device-px viewport', async () => {
    let chooser = vi.fn(() => 5);
    let game = new Game({assetBundles: [], choosePixelScale: chooser});

    cleanups.push(() => {
      game.destroy();
    });

    await game.init();
    await game.init(); // init after init is a no-op: no second chooser run

    expect(chooser).toHaveBeenCalledTimes(1);
    expect(chooser).toHaveBeenCalledWith({
      width: window.innerWidth * window.devicePixelRatio,
      height: window.innerHeight * window.devicePixelRatio,
    });
    expect(game.pixelScale).toBe(5);
  });

  test('a non-integer chooser result rejects init and pixelScale stays unset', async () => {
    let game = new Game({assetBundles: [], choosePixelScale: () => 2.5});

    await expect(game.init()).rejects.toThrow(
      'Invalid pixelScale "2.5": the chooser must return an integer >= 1!',
    );
    expect(() => game.pixelScale).toThrow('pixelScale is not available before init()!');
  });

  test('a chooser result below 1 rejects init', async () => {
    let game = new Game({assetBundles: [], choosePixelScale: () => 0});

    await expect(game.init()).rejects.toThrow('Invalid pixelScale "0"');
  });

  test('without an override the engine default policy applies', async () => {
    let game = new Game({assetBundles: []});

    cleanups.push(() => {
      game.destroy();
    });

    await game.init();

    expect(game.pixelScale).toBe(
      defaultChoosePixelScale({
        width: window.innerWidth * window.devicePixelRatio,
        height: window.innerHeight * window.devicePixelRatio,
      }),
    );
  });
});

describe('Game scaled root', () => {
  afterEach(() => {
    for (let cleanup of cleanups) {
      cleanup();
    }

    cleanups = [];
    vi.restoreAllMocks();
  });

  test('init applies pixelScale as the root view scale', async () => {
    let game = new Game({assetBundles: [], choosePixelScale: () => 4});

    cleanups.push(() => {
      game.destroy();
    });

    await game.init();

    expect(game.view.scale.x).toBe(4);
    expect(game.view.scale.y).toBe(4);
  });

  test('init pins the root transform origin to the top-left corner', async () => {
    let game = new Game({assetBundles: [], choosePixelScale: () => 4});

    cleanups.push(() => {
      game.destroy();
    });

    await game.init();

    // Without this the scaled root composes about @pixi/layout's default 50%
    // transform origin and the whole scene shifts by (1 - pixelScale)/2 of the box.
    expect(game.view.layout).toMatchObject({transformOrigin: 0});
  });

  test('handleResize lays out the view and hit area in art px', async () => {
    let game = new Game({assetBundles: [], choosePixelScale: () => 4});
    let element = document.createElement('div');

    // happy-dom elements have no layout; pin the client box the resize reads.
    Object.defineProperty(element, 'clientWidth', {value: 800});
    Object.defineProperty(element, 'clientHeight', {value: 600});
    document.body.append(element);

    await game.init();
    game.addRef({current: element});
    cleanups.push(() => {
      game.destroy();
      element.remove();
    });

    // 800×600 CSS at DPR 1 → renderer 800×600 device px → 200×150 art px.
    expect(game.view.layout).toMatchObject({width: 200, height: 150, transformOrigin: 0});

    let hitArea = game.view.hitArea as unknown as {width: number; height: number};

    expect(hitArea.width).toBe(200);
    expect(hitArea.height).toBe(150);
  });
});

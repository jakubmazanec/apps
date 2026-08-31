import {LayoutSystem} from '@pixi/layout';
import * as pixi from 'pixi.js';
import {afterEach, beforeAll, beforeEach, describe, expect, test, vitest} from 'vitest';

import {Game} from '../source/engine/app/Game.js';
import {GameAssets} from '../source/engine/app/GameAssets.js';
import {GameTheme} from '../source/engine/app/GameTheme.js';
import {getPixelScale} from '../source/engine/app/getPixelScale.js';
import {Spriteset} from '../source/engine/graphics/Spriteset.js';
import {GameInput} from '../source/engine/input/GameInput.js';
import {type FocusDirection} from '../source/engine/ui/UiRoot.js';
import {type UiThemeDescription} from '../source/engine/ui/UiTheme.js';
import {theme} from '../source/game/core/theme.js';

// Every frame source/game/core/theme.ts names. A stand-in object per frame is
// enough — nothing here renders.
const UI_FRAMES = [
  'banner',
  'button-normal',
  'button-hovered',
  'button-active',
  'button-disabled',
  'toggle-unchecked',
  'toggle-checked',
  'toggle-hovered',
  'toggle-hovered-checked',
  'toggle-disabled',
  'toggle-disabled-checked',
  'text-input-normal',
  'text-input-hovered',
  'text-input-disabled',
  'slider-track',
  'slider-track-hovered',
  'slider-track-disabled',
  'slider-fill',
  'focus-ring',
];
const uiSpriteset = new Spriteset({
  textures: Object.fromEntries(
    UI_FRAMES.map((frameName) => [frameName, {frame: frameName}]),
  ) as never,
  animations: {},
});
// An extension descriptor with no cache/loader, so GameAssets' module-level
// `pixi.extensions.add` calls register nothing. The literal 'asset' rather than
// pixi.ExtensionType.Asset: mock factories are hoisted above the imports, so a
// static pixi binding would still be in its TDZ when they run. `as never`
// because the real exports carry those parsers and this stub deliberately does not.
const assetStub = vitest.hoisted(() => ({extension: 'asset'}));

vitest.mock(import('../source/engine/pixi-tools/tiledTilesetAsset.js'), () => ({
  tiledTilesetAsset: assetStub as never,
}));
vitest.mock(import('../source/engine/pixi-tools/tiledTilemapAsset.js'), () => ({
  tiledTilemapAsset: assetStub as never,
}));
vitest.mock(import('../source/engine/pixi-tools/audioBufferAsset.js'), () => ({
  audioBufferAsset: assetStub as never,
}));
vitest.mock(import('../source/engine/pixi-tools/spritesetAsset.js'), () => ({
  spritesetAsset: assetStub as never,
}));

let frameTime = 0;

function frame(game: InstanceType<typeof Game>) {
  frameTime += 16.7;
  game.app.ticker.update(frameTime);
}

const FOCUS_BINDINGS = {
  focus: {
    up: {keys: ['ArrowUp']},
    down: {keys: ['ArrowDown']},
    left: {keys: ['ArrowLeft']},
    right: {keys: ['ArrowRight']},
    next: {keys: ['Tab']},
    previous: {keys: ['Shift+Tab']},
    activate: {keys: ['Enter', 'Space']},
    cancel: {keys: ['Escape']},
    increase: {keys: ['Equal', 'PageUp']},
    decrease: {keys: ['Minus', 'PageDown']},
  },
};
let cleanups: Array<() => void> = [];

async function createGame(
  input: GameInput = new GameInput({}),
  themeDescription: UiThemeDescription = theme,
) {
  pixi.Assets.cache.set('ui', uiSpriteset);

  let game = new Game({
    assets: new GameAssets({
      bundles: [{name: 'default'}, {name: 'game', sounds: {bump: ['bump.wav']}}],
    }),
    input,
    theme: new GameTheme(themeDescription),
  });
  let element = document.createElement('div');

  await game.init();

  game.app.ticker.stop();
  Object.assign(game.app.ticker, {lastTime: 0});

  document.body.append(element);
  game.mount({current: element});
  cleanups.push(() => {
    try {
      game.destroy();
    } catch {
      // destroy may throw if not fully initialized
    }

    element.remove();
  });

  let ui = {
    moveFocus: vitest.fn<(direction: FocusDirection) => void>(),
    focusNext: vitest.fn<() => void>(),
    focusPrevious: vitest.fn<() => void>(),
    activate: vitest.fn<() => void>(),
    increase: vitest.fn<() => void>(),
    decrease: vitest.fn<() => void>(),
    cancel: vitest.fn<() => boolean>(() => false),
  };
  let view = new pixi.Container();

  game.currentScreen = {
    view,
    ui,
    resize: vitest.fn<() => void>(),
  } as unknown as (typeof game)['currentScreen'];

  return {game, ui};
}

function createFakeScreen(assetBundles: string[] = []) {
  return {
    assetBundles,
    view: new pixi.Container(),
    update() {},
    resize: vitest.fn<() => void>(),
    show: vitest.fn<() => Promise<void>>(async () => {}),
    hide: vitest.fn<() => Promise<void>>(async () => {}),
  };
}

function createFakeErrorScreen() {
  return {
    assetBundles: [],
    view: new pixi.Container(),
    update() {},
    resize: vitest.fn<() => void>(),
    show: vitest.fn<() => Promise<void>>(async () => {}),
    hide: vitest.fn<() => Promise<void>>(async () => {}),
    contents: {showError: vitest.fn<(error: unknown) => void>()},
    attach: vitest.fn<(game: Game) => void>(),
  };
}

function press(code: string, init: KeyboardEventInit = {}) {
  let event = new KeyboardEvent('keydown', {code, cancelable: true, ...init});

  globalThis.dispatchEvent(event);

  return event;
}

// eslint-disable-next-line vitest/require-top-level-describe -- global beforeAll shared by all describe blocks
beforeAll(async () => {
  let layoutSystem = new LayoutSystem();

  await layoutSystem.init({
    layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
  });
});

// eslint-disable-next-line vitest/require-top-level-describe -- global beforeEach shared by all describe blocks
beforeEach(() => {
  frameTime = 0;
  pixi.Assets.cache.set('ui', uiSpriteset);
  vitest.spyOn(pixi.Assets, 'loadBundle').mockResolvedValue(undefined);
  vitest.spyOn(pixi.Assets, 'backgroundLoadBundle').mockResolvedValue(undefined);
});

describe('Game focus key routing', () => {
  afterEach(() => {
    for (let cleanup of cleanups) {
      cleanup();
    }

    cleanups = [];
    vitest.restoreAllMocks();
  });

  test('routes directional commands to the current screen ui', async () => {
    let input = new GameInput(FOCUS_BINDINGS);
    let {game, ui} = await createGame(input);

    press('ArrowDown');
    frame(game);

    expect(ui.moveFocus).toHaveBeenCalledWith('down');
  });

  test('routes activate once per press, not once per OS repeat', async () => {
    let input = new GameInput(FOCUS_BINDINGS);
    let {game, ui} = await createGame(input);

    press('Enter');
    frame(game);
    frame(game);
    frame(game);

    expect(ui.activate).toHaveBeenCalledTimes(1);
  });

  test('routes increase once per press, not once per OS repeat', async () => {
    let input = new GameInput(FOCUS_BINDINGS);
    let {game, ui} = await createGame(input);

    press('Equal');
    frame(game);
    frame(game);

    expect(ui.increase).toHaveBeenCalledTimes(1);
  });

  test('routes decrease to the current screen ui', async () => {
    let input = new GameInput(FOCUS_BINDINGS);
    let {game, ui} = await createGame(input);

    press('Minus');
    frame(game);

    expect(ui.decrease).toHaveBeenCalledTimes(1);
  });

  test('Shift+Tab routes previous and never next', async () => {
    let input = new GameInput(FOCUS_BINDINGS);
    let {game, ui} = await createGame(input);

    press('ShiftLeft');
    press('Tab');
    frame(game);

    expect(ui.focusPrevious).toHaveBeenCalledTimes(1);
    expect(ui.focusNext).not.toHaveBeenCalled();
  });

  test('an unclaimed cancel reaches the screen', async () => {
    let input = new GameInput(FOCUS_BINDINGS);
    let {game, ui} = await createGame(input);
    let cancelled = 0;

    (game.currentScreen as unknown as {cancel: () => void}).cancel = () => {
      cancelled += 1;
    };

    press('Escape');
    frame(game);

    expect(ui.cancel).toHaveBeenCalledTimes(1);
    expect(cancelled).toBe(1);
  });

  test('a claimed cancel stops at the ui', async () => {
    let input = new GameInput(FOCUS_BINDINGS);
    let {game, ui} = await createGame(input);
    let cancelled = 0;

    ui.cancel.mockReturnValue(true);
    (game.currentScreen as unknown as {cancel: () => void}).cancel = () => {
      cancelled += 1;
    };

    press('Escape');
    frame(game);

    expect(cancelled).toBe(0);
  });

  test('ignores keys while a DOM input element has focus', async () => {
    let input = new GameInput(FOCUS_BINDINGS);
    let {game, ui} = await createGame(input);
    let field = document.createElement('input');

    document.body.append(field);
    field.dispatchEvent(
      new KeyboardEvent('keydown', {code: 'Tab', cancelable: true, bubbles: true}),
    );
    frame(game);

    expect(ui.focusNext).not.toHaveBeenCalled();

    field.remove();
  });

  test('is inert when the input table binds no focus commands', async () => {
    let {game, ui} = await createGame();

    press('Tab');
    frame(game);

    expect(ui.focusNext).not.toHaveBeenCalled();
  });

  test('mount after unmount does not stack duplicate resize handlers', async () => {
    let {game} = await createGame();
    let element = document.createElement('div');

    document.body.append(element);
    game.unmount();
    game.mount({current: element});

    let spy = vitest.spyOn(game.app.renderer, 'resize');

    globalThis.dispatchEvent(new Event('resize'));

    expect(spy).toHaveBeenCalledTimes(1);

    element.remove();
  });

  test('destroy disposes the pixi application', async () => {
    let {game} = await createGame();
    let spy = vitest.spyOn(game.app, 'destroy');

    game.destroy();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('destroy after destroy throws', async () => {
    let {game} = await createGame();

    game.destroy();

    expect(() => game.destroy()).toThrow('Game must be running!');
  });

  test('destroy before init throws', () => {
    let game = new Game({
      assets: new GameAssets({bundles: [{name: 'default'}]}),
      input: new GameInput({}),
      theme: new GameTheme(theme),
    });

    expect(() => game.destroy()).toThrow('Game must be running!');
  });

  test('init after destroy throws', async () => {
    let {game} = await createGame();
    let spy = vitest.spyOn(game.app, 'init');

    game.destroy();

    await expect(game.init()).rejects.toThrow('currently state is "destroyed"');
    expect(spy).not.toHaveBeenCalled();
  });

  test('a second init() during the async span does not double-run initialization', async () => {
    let game = new Game({
      assets: new GameAssets({bundles: [{name: 'default'}]}),
      input: new GameInput({}),
      theme: new GameTheme(theme),
    });
    let spy = vitest.spyOn(game.app, 'init');

    cleanups.push(() => {
      game.destroy();
    });

    // Both calls overlap: the second starts while the first is still awaiting,
    // which is the route-remount re-entrancy the initializing state guards. The
    // guard reports rather than resolving quietly, so the second call rejects.
    let initialized = game.init();

    await expect(game.init()).rejects.toThrow('currently state is "initializing"');

    await initialized;

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('init after a successful init throws', async () => {
    let {game} = await createGame();
    let spy = vitest.spyOn(game.app, 'init');

    await expect(game.init()).rejects.toThrow('currently state is "running"');
    expect(spy).not.toHaveBeenCalled();
  });

  test('mount before init throws', () => {
    let game = new Game({
      assets: new GameAssets({bundles: [{name: 'default'}]}),
      input: new GameInput({}),
      theme: new GameTheme(theme),
    });
    let element = document.createElement('div');

    expect(() => game.mount({current: element})).toThrow('Game must be running!');
  });

  test('renderer methods throw after destroy', async () => {
    let {game} = await createGame();

    game.destroy();

    expect(() =>
      game.addToView({view: {}, update() {}} as unknown as Parameters<
        (typeof game)['addToView']
      >[0]),
    ).toThrow('Game must be running!');
  });
});

describe('Game screen lifecycle', () => {
  afterEach(() => {
    for (let cleanup of cleanups) {
      cleanup();
    }

    cleanups = [];
    vitest.restoreAllMocks();
  });

  test('showScreen hides the outgoing screen before removing it', async () => {
    let {game} = await createGame();
    let first = createFakeScreen();
    let second = createFakeScreen();

    game.currentScreen = null; // createGame's ui fake has no hide()
    game.screens.push(
      first as unknown as (typeof game.screens)[number],
      second as unknown as (typeof game.screens)[number],
    );

    await game.showScreen(first as never);

    let removeSpy = vitest.spyOn(game.app.ticker, 'remove');

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

  test('a screen hidden by a later transition can be shown again', async () => {
    let {game} = await createGame();
    let first = createFakeScreen();
    let second = createFakeScreen();

    game.currentScreen = null;
    game.screens.push(
      first as unknown as (typeof game.screens)[number],
      second as unknown as (typeof game.screens)[number],
    );

    await game.showScreen(first as never);
    await game.showScreen(second as never); // hides first and clears the currentScreen pointer

    // Without the cleared pointer this would hit showScreen's resume
    // early-return and leave the stage blank.
    await game.showScreen(first as never);

    expect(game.currentScreen).toBe(first);
    expect(first.show).toHaveBeenCalledTimes(2);
  });

  test('the loading screen hidden mid-transition leaves the incoming screen current', async () => {
    let {game} = await createGame();
    let loading = createFakeScreen();
    let screen = createFakeScreen(['game']); // unloaded bundles route through the loading screen

    game.currentScreen = null;
    game.loadingScreen = loading as never;
    game.screens.push(screen as unknown as (typeof game.screens)[number]);

    await game.showScreen(screen as never);

    expect(game.currentScreen).toBe(screen);
  });

  test('a rejected bundle load with no error screen resolves and clears the current screen', async () => {
    let {game} = await createGame();
    let loading = createFakeScreen();
    let screen = createFakeScreen(['game']);
    let failure = new Error('network');
    let consoleError = vitest.spyOn(console, 'error').mockImplementation(() => {});

    game.currentScreen = null;
    game.loadingScreen = loading as never;
    game.screens.push(screen as unknown as (typeof game.screens)[number]);

    vitest.spyOn(pixi.Assets, 'loadBundle').mockRejectedValueOnce(failure);

    await expect(game.showScreen(screen as never)).resolves.toBe(game);

    // Neither screen is hidden: a transition that failed does not run teardown hooks on the way
    // out. The target's show() was never reached at all — the load rejects first.
    expect(loading.hide).not.toHaveBeenCalled();
    expect(screen.hide).not.toHaveBeenCalled();
    expect(screen.show).not.toHaveBeenCalled();
    // With no error screen registered the console log is the only trace, and nothing is current.
    expect(game.currentScreen).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(failure);
  });

  test('a failed bundle load resolves and reports on the error screen', async () => {
    let {game} = await createGame();
    let loading = createFakeScreen();
    let errorScreen = createFakeErrorScreen();
    let screen = createFakeScreen(['game']);
    let failure = new Error('network');
    // showScreen resolves, so this log is the only trace a failure leaves when no error
    // screen is registered; silencing it also keeps the reporter output clean.
    let consoleError = vitest.spyOn(console, 'error').mockImplementation(() => {});

    game.currentScreen = null;
    game.loadingScreen = loading as never;
    game.errorScreen = errorScreen as never;
    game.screens.push(screen as unknown as (typeof game.screens)[number]);

    // A truthy parent makes the loading screen count as attached, so the catch block's
    // detach branch actually runs instead of being skipped.
    loading.view.parent = new pixi.Container();

    vitest.spyOn(pixi.Assets, 'loadBundle').mockRejectedValueOnce(failure);

    let removeSpy = vitest.spyOn(game.app.ticker, 'remove');

    // The failure is handled by UI, so the caller gets a resolved promise.
    await expect(game.showScreen(screen as never)).resolves.toBe(game);

    expect(errorScreen.contents.showError).toHaveBeenCalledWith(failure);
    expect(consoleError).toHaveBeenCalledWith(failure);
    expect(game.currentScreen).toBe(errorScreen);
    expect(screen.show).not.toHaveBeenCalled();
    // The loading screen is detached, not hidden: a transition that failed does not run
    // teardown hooks on the way out.
    expect(loading.hide).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith(loading.update, loading);

    // The game object is not wedged: the next transition still runs end to end.
    await game.showScreen(screen as never);

    expect(game.currentScreen).toBe(screen);
    expect(screen.show).toHaveBeenCalledTimes(1);
  });

  test('a rejecting show() detaches the crashed screen without hiding it', async () => {
    let {game} = await createGame();
    let errorScreen = createFakeErrorScreen();
    let screen = createFakeScreen();
    let failure = new Error('onShow failed');
    let consoleError = vitest.spyOn(console, 'error').mockImplementation(() => {});

    game.currentScreen = null;
    game.errorScreen = errorScreen as never;
    game.screens.push(screen as unknown as (typeof game.screens)[number]);

    vitest.spyOn(screen, 'show').mockRejectedValueOnce(failure);

    let removeSpy = vitest.spyOn(game.app.ticker, 'remove');

    await expect(game.showScreen(screen as never)).resolves.toBe(game);

    // hide() would run onHide teardown for a show() that never completed; detaching is
    // the whole cleanup a crashed screen gets.
    expect(screen.hide).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith(screen.update, screen);
    expect(errorScreen.contents.showError).toHaveBeenCalledWith(failure);
    expect(consoleError).toHaveBeenCalledWith(failure);
    expect(game.currentScreen).toBe(errorScreen);
  });

  test('an error screen that fails to show claims nothing', async () => {
    let {game} = await createGame();
    let errorScreen = createFakeErrorScreen();
    let screen = createFakeScreen();
    let consoleError = vitest.spyOn(console, 'error').mockImplementation(() => {});

    game.currentScreen = null;
    game.errorScreen = errorScreen as never;
    game.screens.push(screen as unknown as (typeof game.screens)[number]);

    vitest.spyOn(screen, 'show').mockRejectedValueOnce(new Error('onShow failed'));
    errorScreen.contents.showError.mockImplementationOnce(() => {
      throw new Error('the reporter failed too');
    });

    await expect(game.showScreen(screen as never)).resolves.toBe(game);

    // currentScreen pointing at a screen with nothing attached is the retry-proof shape this
    // branch exists to remove, so the pointer is claimed only once show() has resolved.
    expect(game.currentScreen).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  test('a failed transition without an error screen resolves and logs the failure', async () => {
    let {game} = await createGame();
    let screen = createFakeScreen(['game']);
    let failure = new Error('network');
    let consoleError = vitest.spyOn(console, 'error').mockImplementation(() => {});

    game.currentScreen = null;
    game.screens.push(screen as unknown as (typeof game.screens)[number]);

    vitest.spyOn(pixi.Assets, 'loadBundle').mockRejectedValueOnce(failure);

    await expect(game.showScreen(screen as never)).resolves.toBe(game);

    expect(game.currentScreen).toBeNull();
    // An errorScreen is optional, so with none registered this log is the entire report.
    expect(consoleError).toHaveBeenCalledWith(failure);
  });

  test('addErrorScreen registers the screen so it can be shown', async () => {
    let {game} = await createGame();
    let errorScreen = createFakeErrorScreen();

    game.currentScreen = null;
    game.addErrorScreen(errorScreen as never);

    expect(game.errorScreen).toBe(errorScreen);
    expect(game.screens).toContain(errorScreen);
  });

  test('showScreen starts the bundle load before the loading screen finishes showing', async () => {
    let {game} = await createGame();
    let loading = createFakeScreen();
    let screen = createFakeScreen(['game']);
    let loadBundleSpy = vitest.spyOn(pixi.Assets, 'loadBundle');
    let resolveShow!: () => void;

    vitest.spyOn(loading, 'show').mockImplementation(
      async () =>
        new Promise<void>((resolve) => {
          resolveShow = resolve;
        }),
    );

    game.currentScreen = null;
    game.loadingScreen = loading as never;
    game.screens.push(screen as unknown as (typeof game.screens)[number]);

    loadBundleSpy.mockClear();

    let transition = game.showScreen(screen as never);

    expect(loading.show).toHaveBeenCalledTimes(1);
    expect(loadBundleSpy).toHaveBeenCalledTimes(1);

    resolveShow();
    await transition;

    expect(game.currentScreen).toBe(screen);
    expect(loading.hide).toHaveBeenCalledTimes(1);
  });

  test('a second showScreen during an in-flight transition throws', async () => {
    let {game} = await createGame();
    let loading = createFakeScreen();
    let screen = createFakeScreen(['game']);
    let spy = vitest.spyOn(pixi.Assets, 'loadBundle');

    spy.mockClear();

    game.currentScreen = null;
    game.loadingScreen = loading as never;
    game.screens.push(screen as unknown as (typeof game.screens)[number]);

    let transition = game.showScreen(screen as never);

    await expect(game.showScreen(screen as never)).rejects.toThrow('Game must be running!');

    await transition;

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
    vitest.restoreAllMocks();
  });

  test('init starts the asset pipeline before app.init resolves', async () => {
    let game = new Game({
      assets: new GameAssets({bundles: [{name: 'default'}]}),
      input: new GameInput({}),
      theme: new GameTheme(theme),
    });
    let resolveAppInit!: () => void;
    let appInitStartedAtBundleLoad: boolean | null = null;

    cleanups.push(() => {
      try {
        game.destroy();
      } catch {
        // destroy may throw if not fully initialized
      }
    });

    let appInitSpy = vitest
      .spyOn(game.app, 'init')
      .mockImplementation(async (_options: unknown) => {
        Object.assign(game.app, {
          renderer: {
            screen: {width: 0, height: 0},
            resize: vitest.fn<() => void>(),
            destroy: vitest.fn<() => void>(),
          },
          ticker: {stop() {}, add() {}, remove() {}, update() {}},
        });
        await new Promise<void>((resolve) => {
          resolveAppInit = resolve;
        });
      });
    let assetsInitSpy = vitest.spyOn(pixi.Assets, 'init');

    vitest.spyOn(pixi.Assets, 'loadBundle').mockImplementation(async () => {
      appInitStartedAtBundleLoad = appInitSpy.mock.calls.length > 0;
    });

    let initPromise = game.init();

    expect(assetsInitSpy).toHaveBeenCalledTimes(1);

    resolveAppInit();
    await initPromise;

    expect(appInitStartedAtBundleLoad).toBe(true);
  });

  test('scaleMode is nearest by the time the default bundle load starts', async () => {
    let game = new Game({
      assets: new GameAssets({bundles: [{name: 'default'}]}),
      input: new GameInput({}),
      theme: new GameTheme(theme),
    });
    let scaleModeAtLoad: unknown;

    cleanups.push(() => {
      game.destroy();
    });

    // defaultOptions is a module-global shared across tests; clearing it
    // proves init() itself set scaleMode before the load, not a prior test.
    (pixi.TextureSource.defaultOptions as {scaleMode?: unknown}).scaleMode = undefined;

    vitest.spyOn(pixi.Assets, 'loadBundle').mockImplementation(async () => {
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
    vitest.restoreAllMocks();
  });

  test('init pins the ticker clamp: minFPS = 10 caps one frame step at 100 ms', async () => {
    let game = new Game({
      assets: new GameAssets({bundles: [{name: 'default'}]}),
      input: new GameInput({}),
      theme: new GameTheme(theme),
    });

    cleanups.push(() => {
      game.destroy();
    });

    await game.init();

    // On pixi <= 8.16 the minFPS setter computes Math.min(maxFPS, fps) and maxFPS
    // defaults to 0, so Game.init()'s `minFPS = 10` wiped the clamp to Infinity;
    // fixed upstream in 8.17.0 (pixijs/pixijs#11952). This guards the 100 ms cap.
    expect(game.app.ticker.minFPS).toBe(10);
  });
});

describe('Game pixelScale', () => {
  afterEach(() => {
    for (let cleanup of cleanups) {
      cleanup();
    }

    cleanups = [];
    vitest.restoreAllMocks();
  });

  test('init derives pixelScale from the device-px viewport height', async () => {
    let game = new Game({
      assets: new GameAssets({bundles: [{name: 'default'}]}),
      input: new GameInput({}),
      theme: new GameTheme(theme),
    });

    cleanups.push(() => {
      game.destroy();
    });

    await game.init();

    expect(game.pixelScale).toBe(getPixelScale(window.innerHeight * window.devicePixelRatio));
  });
});

describe('Game scaled root', () => {
  // happy-dom's default 768-px viewport maps to pixelScale 3; these tests pin the
  // height getPixelScale maps to 4, the scale their expectations are written for.
  let originalInnerHeight: number;

  beforeEach(() => {
    originalInnerHeight = window.innerHeight;
    window.innerHeight = 1080;
  });

  afterEach(() => {
    for (let cleanup of cleanups) {
      cleanup();
    }

    cleanups = [];
    window.innerHeight = originalInnerHeight;
    vitest.restoreAllMocks();
  });

  test('init applies pixelScale as the root view scale', async () => {
    let game = new Game({
      assets: new GameAssets({bundles: [{name: 'default'}]}),
      input: new GameInput({}),
      theme: new GameTheme(theme),
    });

    cleanups.push(() => {
      game.destroy();
    });

    await game.init();

    expect(game.view.scale.x).toBe(4);
    expect(game.view.scale.y).toBe(4);
  });

  test('init pins the root transform origin to the top-left corner', async () => {
    let game = new Game({
      assets: new GameAssets({bundles: [{name: 'default'}]}),
      input: new GameInput({}),
      theme: new GameTheme(theme),
    });

    cleanups.push(() => {
      game.destroy();
    });

    await game.init();

    // Without this the scaled root composes about @pixi/layout's default 50%
    // transform origin and the whole scene shifts by (1 - pixelScale)/2 of the box.
    expect(game.view.layout!.style).toMatchObject({transformOrigin: 0});
  });

  test('handleResize lays out the view and hit area in art px', async () => {
    let game = new Game({
      assets: new GameAssets({bundles: [{name: 'default'}]}),
      input: new GameInput({}),
      theme: new GameTheme(theme),
    });
    let element = document.createElement('div');

    // happy-dom elements have no layout; pin the client box the resize reads.
    Object.defineProperty(element, 'clientWidth', {value: 800});
    Object.defineProperty(element, 'clientHeight', {value: 600});
    document.body.append(element);

    await game.init();
    game.mount({current: element});
    cleanups.push(() => {
      game.destroy();
      element.remove();
    });

    // 800×600 CSS at DPR 1 → renderer 800×600 device px → 200×150 art px.
    expect(game.view.layout!.style).toMatchObject({width: 200, height: 150, transformOrigin: 0});

    let hitArea = game.view.hitArea as unknown as {width: number; height: number};

    expect(hitArea.width).toBe(200);
    expect(hitArea.height).toBe(150);
  });
});

describe('Game input clock', () => {
  afterEach(() => {
    for (let cleanup of cleanups) {
      cleanup();
    }

    cleanups = [];
    vitest.restoreAllMocks();
  });

  test('latches input once per frame, so an edge survives a world that never runs', async () => {
    let input = new GameInput({actions: {interact: {keys: ['KeyE']}}});
    let {game} = await createGame(input);

    press('KeyE');
    frame(game);

    expect(input.pressed('interact')).toBe(true);

    frame(game);

    expect(input.pressed('interact')).toBe(false);
    expect(input.held('interact')).toBe(true);
  });

  test('registers the input callback at high priority, ahead of screens and worlds', async () => {
    let input = new GameInput({actions: {interact: {keys: ['KeyE']}}});
    let game = new Game({
      assets: new GameAssets({bundles: [{name: 'default'}]}),
      input,
      theme: new GameTheme(theme),
    });

    await game.init();

    let spy = vitest.spyOn(game.app.ticker, 'add');
    let element = document.createElement('div');

    document.body.append(element);
    game.mount({current: element});
    // Teardown before the assertion: a failing expect would otherwise leak an
    // attached GameInput, and its window listeners, into every later test.
    cleanups.push(() => {
      game.destroy();
      element.remove();
    });

    expect(spy).toHaveBeenCalledWith(expect.any(Function), game, pixi.UPDATE_PRIORITY.HIGH);
  });

  test('unmount detaches input, so a later press cannot land', async () => {
    let input = new GameInput({actions: {interact: {keys: ['KeyE']}}});
    let {game} = await createGame(input);

    game.unmount();
    press('KeyE');
    frame(game);

    expect(input.held('interact')).toBe(false);
  });

  test('mount after unmount does not stack duplicate input callbacks', async () => {
    // A second registration would latch twice per frame, so the press edge
    // would be spent by the first call and gone before any reader ran.
    let input = new GameInput({actions: {interact: {keys: ['KeyE']}}});
    let {game} = await createGame(input);
    let element = document.createElement('div');

    document.body.append(element);
    game.unmount();
    game.mount({current: element});

    press('KeyE');
    frame(game);

    expect(input.pressed('interact')).toBe(true);

    element.remove();
  });
});

describe('Game theme resolution', () => {
  afterEach(() => {
    for (let cleanup of cleanups) {
      cleanup();
    }

    cleanups = [];
    vitest.restoreAllMocks();
  });

  test('init resolves the theme description into textures', async () => {
    // createGame() already awaits init() internally, so the theme is resolved
    // by the time it returns — no separate game.init() call needed here.
    let {game} = await createGame();

    expect(game.theme.button.normal).toBe(uiSpriteset.textures['button-normal']);
    expect(game.theme.focusRing.texture).toBe(uiSpriteset.textures['focus-ring']);
    expect(game.theme.focusRing.padding).toBe(2);
    expect(game.theme.text.label.fontFamily).toBe('monogram-outline');
    expect(game.theme.text.body.fontFamily).toBe('monogram');
  });

  test('reading the theme before init throws', () => {
    // createGame() can't produce an uninitialized Game, since it awaits
    // init() itself; construct one directly instead.
    let game = new Game({
      assets: new GameAssets({bundles: [{name: 'default'}]}),
      input: new GameInput({}),
      theme: new GameTheme(theme),
    });

    expect(() => game.theme).toThrow("Theme isn't resolved yet!");
  });

  test('init throws when the description names a frame the atlas lacks', async () => {
    await expect(
      createGame(new GameInput({}), {
        ...theme,
        panel: {background: ['ui', 'no-such-frame']},
      }),
    ).rejects.toThrow(`Spriteset doesn't contain texture "no-such-frame"!`);
  });
});

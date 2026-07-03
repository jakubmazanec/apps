import {afterEach, describe, expect, test, vi} from 'vitest';

vi.mock('pixi.js', () => ({
  Application: class Application {
    canvas = document.createElement('canvas');
    renderer = {resize() {}};
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
    layout: unknown;

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

const {Game} = await import('../source/engine/app/Game.js');

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

  game.currentScreen = {view: {parent: {}}, ui} as unknown as (typeof game)['currentScreen'];

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

  test('removeRef keeps focus routing active until destroy', async () => {
    let {game, ui} = await createGame(FOCUS_KEYS);

    // The keydown listener now lives for the Game lifetime (#disposables runs
    // init -> destroy), so detaching the canvas does not stop focus routing.
    game.removeRef();
    press('Tab');

    expect(ui.focusNext).toHaveBeenCalledTimes(1);
  });

  test('destroy detaches the keydown listener', async () => {
    let {game, ui} = await createGame(FOCUS_KEYS);

    game.destroy();
    press('Tab');

    expect(ui.focusNext).not.toHaveBeenCalled();
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
});

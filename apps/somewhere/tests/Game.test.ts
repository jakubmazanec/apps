import {afterEach, describe, expect, test, vi} from 'vitest';

vi.mock('pixi.js', () => ({
  Application: class Application {
    canvas = document.createElement('canvas');
    renderer = {resize() {}};
    screen = {width: 0, height: 0};
    stage = {addChild() {}};
    ticker = {add() {}, remove() {}};
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

function createGame(focusKeys?: typeof FOCUS_KEYS) {
  let game = new Game({assetBundles: [], ...(focusKeys === undefined ? {} : {focusKeys})});
  let element = document.createElement('div');

  document.body.append(element);
  game.addRef({current: element});
  cleanups.push(() => {
    game.removeRef();
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

  test('routes arrow keys to moveFocus', () => {
    let {ui} = createGame(FOCUS_KEYS);

    press('ArrowUp');
    press('ArrowDown');
    press('ArrowLeft');
    press('ArrowRight');

    expect(ui.moveFocus.mock.calls).toEqual([['up'], ['down'], ['left'], ['right']]);
  });

  test('routes Tab and Shift+Tab to linear navigation', () => {
    let {ui} = createGame(FOCUS_KEYS);

    press('Tab');

    expect(ui.focusNext).toHaveBeenCalledTimes(1);
    expect(ui.focusPrevious).not.toHaveBeenCalled();

    press('Tab', {shiftKey: true});

    expect(ui.focusNext).toHaveBeenCalledTimes(1);
    expect(ui.focusPrevious).toHaveBeenCalledTimes(1);
  });

  test('routes Enter and Space to activate', () => {
    let {ui} = createGame(FOCUS_KEYS);

    press('Enter');
    press('Space');

    expect(ui.activate).toHaveBeenCalledTimes(2);
  });

  test('prevents default on mapped keys only', () => {
    createGame(FOCUS_KEYS);

    expect(press('Tab').defaultPrevented).toBeTruthy();
    expect(press('KeyA').defaultPrevented).toBeFalsy();
  });

  test('ignores keys while a DOM input element has focus', () => {
    let {ui} = createGame(FOCUS_KEYS);
    let input = document.createElement('input');

    document.body.append(input);

    let event = new KeyboardEvent('keydown', {code: 'Tab', cancelable: true, bubbles: true});

    input.dispatchEvent(event);

    expect(ui.focusNext).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBeFalsy();

    input.remove();
  });

  test('ignores keys while the current screen is hidden', () => {
    let {game, ui} = createGame(FOCUS_KEYS);

    (game.currentScreen as unknown as {view: {parent: unknown}}).view.parent = null;

    press('ArrowDown');

    expect(ui.moveFocus).not.toHaveBeenCalled();
  });

  test('is inert when focusKeys is omitted', () => {
    let {ui} = createGame();

    expect(press('Tab').defaultPrevented).toBeFalsy();
    expect(ui.focusNext).not.toHaveBeenCalled();
  });

  test('removeRef detaches the keydown listener', () => {
    let {game, ui} = createGame(FOCUS_KEYS);

    game.removeRef();
    press('Tab');

    expect(ui.focusNext).not.toHaveBeenCalled();
  });
});

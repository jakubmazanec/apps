import {EventEmitter} from 'eventemitter3';
import type * as pixiTypes from 'pixi.js';
import {Container} from 'pixi.js';
import {describe, expect, test, vitest} from 'vitest';

import {type Game} from '../source/engine/app/Game.js';
import {GameScreen} from '../source/engine/app/GameScreen.js';
import {type MapTile} from '../source/engine/tiled/Map.js';
import {type UiTheme} from '../source/engine/ui/UiTheme.js';
import {type UIEventMap} from '../source/game/core/uiEvents.js';
import {createTestTheme} from './createTestTheme.js';

// GameScreen builds a UiRoot, which registers its pointertap listeners via
// the federated event system (addEventListener), installed by this side effect.
import 'pixi.js/events';

type MockContainer = {children: MockContainer[]};

function createScreen(options: {onHide?: () => void; onShow?: () => void; theme?: UiTheme} = {}) {
  let {theme = createTestTheme(), ...screenOptions} = options;
  let events = new EventEmitter<UIEventMap>();
  let screen = new GameScreen({events, ...screenOptions});

  screen.attach({
    app: {ticker: {add: vitest.fn<() => void>(), remove: vitest.fn<() => void>()}},
    theme,
  } as unknown as Game);

  return {screen, events};
}

// A focusable leaf component over a mock pixi view, mirroring the
// tests/UiRoot.test.ts helper of the same name.
function focusable(bounds?: {height: number; width: number; x: number; y: number}) {
  let resolvedBounds = bounds ?? {x: 0, y: 0, width: 10, height: 10};
  let view = Object.assign(new Container(), {getBounds: () => resolvedBounds});

  return {
    view: view as unknown as pixiTypes.Container,
    isFocusable: true,
    activate: vitest.fn<() => void>(),
    increase: vitest.fn<() => void>(),
    decrease: vitest.fn<() => void>(),
  };
}

describe('GameScreen.subscribe', () => {
  test('subscribe registers the handler on the injected emitter', () => {
    let {screen, events} = createScreen();
    let spy = vitest.fn<() => void>();

    screen.subscribe('world:wallHit', spy);
    events.emit('world:wallHit', {tile: null as unknown as MapTile});

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('hide() drains subscriptions so handler is not called after hide', async () => {
    let {screen, events} = createScreen();
    let spy = vitest.fn<() => void>();

    await screen.show();
    screen.subscribe('world:wallHit', spy);
    events.emit('world:wallHit', {tile: null as unknown as MapTile});
    await screen.hide();
    events.emit('world:wallHit', {tile: null as unknown as MapTile});

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('re-show does NOT double-subscribe: one emit fires handler exactly once', async () => {
    let {screen, events} = createScreen();
    let spy = vitest.fn<() => void>();

    await screen.show();
    screen.subscribe('world:wallHit', spy);
    await screen.hide();
    screen.subscribe('world:wallHit', spy);
    events.emit('world:wallHit', {tile: null as unknown as MapTile});

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('hide() with no subscriptions resolves without throwing', async () => {
    let {screen} = createScreen();

    await expect(screen.hide()).resolves.toBeUndefined();
  });
});

describe('GameScreen.ui', () => {
  test('exposes the UI root created eagerly when the game is set', () => {
    let {screen} = createScreen();
    // The root is created once in attach, mounted in the view, and returned
    // identically on every read.
    let uiRoot = screen.ui;

    expect(screen.ui).toBe(uiRoot);
    expect(screen.view.children).toEqual([uiRoot.view]);
  });

  test('keeps the UI root above content added through addToView', () => {
    let {screen} = createScreen();
    let uiRoot = screen.ui;
    let worldView = new Container();

    screen.addToView({view: worldView, update() {}});

    expect(screen.view.children.at(-1)).toBe(uiRoot.view);
  });

  test('update drives the UI root', () => {
    let {screen} = createScreen();
    let spy = vitest.spyOn(screen.ui, 'update');

    screen.update({} as pixiTypes.Ticker);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('hide clears focus', async () => {
    let {screen} = createScreen();
    let spy = vitest.spyOn(screen.ui, 'clearFocus');

    await screen.show();
    await screen.hide();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('a screen that never touched ui still updates and hides safely', async () => {
    let {screen} = createScreen();

    screen.update({} as pixiTypes.Ticker);

    await expect(screen.hide()).resolves.toBeUndefined();
  });
});

describe('GameScreen.ui theme forwarding', () => {
  test('attach passes the game theme to the UI root, which builds the focus ring from it', () => {
    let theme = createTestTheme();
    let {screen} = createScreen({theme});
    let component = focusable();

    screen.ui.addChild(component);
    screen.ui.focusNext();
    screen.ui.update();

    let view = screen.ui.view as unknown as MockContainer;
    let overlay = view.children.at(-1) as MockContainer;
    let ring = overlay.children[0] as unknown as {texture: unknown};

    expect(ring.texture).toBe(theme.focusRing.texture);
  });
});

describe('GameScreen.destroy', () => {
  test('drains subscriptions so handler is not called after destroy', () => {
    let {screen, events} = createScreen();
    let spy = vitest.fn<() => void>();

    screen.subscribe('world:wallHit', spy);
    screen.destroy();
    events.emit('world:wallHit', {tile: null as unknown as MapTile});

    expect(spy).not.toHaveBeenCalled();
  });

  test('disposes the ui root', () => {
    let {screen} = createScreen();
    let spy = vitest.spyOn(screen.ui, 'destroy');

    screen.destroy();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('a screen that never touched ui destroys without throwing', () => {
    let {screen} = createScreen();

    expect(() => screen.destroy()).not.toThrow();
  });
});

describe('GameScreen.hide idempotence', () => {
  test('hide() called twice invokes onHide exactly once and does not throw', async () => {
    let onHide = vitest.fn<() => void>();
    let {screen} = createScreen({onHide});

    await screen.show();
    await screen.hide();

    await expect(screen.hide()).resolves.toBeUndefined();
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  test('hide() before any show() is a no-op', async () => {
    let onHide = vitest.fn<() => void>();
    let {screen} = createScreen({onHide});

    await expect(screen.hide()).resolves.toBeUndefined();
    expect(onHide).not.toHaveBeenCalled();
  });

  test('hide() on a never-attached screen throws', async () => {
    let screen = new GameScreen({events: new EventEmitter<UIEventMap>()});

    await expect(screen.hide()).rejects.toThrow("Screen can't be hidden");
  });

  test('show() after hide() re-arms hide()', async () => {
    let onHide = vitest.fn<() => void>();
    let {screen} = createScreen({onHide});

    await screen.show();
    await screen.hide();
    await screen.show();
    await screen.hide();

    expect(onHide).toHaveBeenCalledTimes(2);
  });
});

describe('GameScreen.show idempotence', () => {
  test('show() called twice invokes onShow exactly once and does not throw', async () => {
    let onShow = vitest.fn<() => void>();
    let {screen} = createScreen({onShow});

    await screen.show();

    await expect(screen.show()).resolves.toBeUndefined();
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  test('show() on a never-attached screen throws', async () => {
    let screen = new GameScreen({events: new EventEmitter<UIEventMap>()});

    await expect(screen.show()).rejects.toThrow("Screen can't be shown");
  });
});

describe('GameScreen.scheduler', () => {
  test('update advances scheduled tweens', () => {
    let {screen} = createScreen();
    let target = {alpha: 0};

    screen.scheduler.tween({target, to: {alpha: 1}, duration: 100});
    screen.update({deltaMS: 50} as pixiTypes.Ticker);

    expect(target.alpha).toBeCloseTo(0.5);
  });

  test('hide() clears in-flight schedules so a pending wait resolves cancelled', async () => {
    let {screen} = createScreen();

    await screen.show();

    let waitPromise = screen.scheduler.wait(100);

    await screen.hide();

    await expect(waitPromise).resolves.toEqual({cancelled: true});
  });
});

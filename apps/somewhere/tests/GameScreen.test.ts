import {EventEmitter} from 'eventemitter3';
import type * as pixiTypes from 'pixi.js';
import {describe, expect, test, vi} from 'vitest';

import {type Game} from '../source/engine/app/Game.js';
import {type MapTile} from '../source/engine/tiled/Map.js';
import {type UIEventMap} from '../source/game/uiEvents.js';

vi.mock('pixi.js', () => ({
  Container: class Container {
    children: Container[] = [];
    parent: Container | null = null;
    visible = true;

    addChild(child: Container) {
      // eslint-disable-next-line no-param-reassign -- mock mirrors Pixi's parent linkage
      child.parent = this;
      this.children.push(child);

      return child;
    }

    addChildAt(child: Container, index: number) {
      // eslint-disable-next-line no-param-reassign -- mock mirrors Pixi's parent linkage
      child.parent = this;
      this.children.splice(index, 0, child);

      return child;
    }

    removeChild(child: Container) {
      let index = this.children.indexOf(child);

      if (index !== -1) {
        this.children.splice(index, 1);
      }

      return child;
    }

    setChildIndex(child: Container, index: number) {
      this.removeChild(child);
      this.children.splice(index, 0, child);
    }

    addEventListener() {}

    removeEventListener() {}

    destroy() {}
  },
}));

const {GameScreen} = await import('../source/engine/app/GameScreen.js');
const {Container} = await import('pixi.js');

function createScreen(options: {onHide?: () => void} = {}) {
  let events = new EventEmitter<UIEventMap>();
  let screen = new GameScreen({events, ...options});

  screen.setGame({
    app: {ticker: {add: vi.fn(), remove: vi.fn()}},
  } as unknown as Game);

  return {screen, events};
}

describe('GameScreen.subscribe', () => {
  test('subscribe registers the handler on the injected emitter', () => {
    let {screen, events} = createScreen();
    let spy = vi.fn();

    screen.subscribe('world:wallHit', spy);
    events.emit('world:wallHit', {tile: null as unknown as MapTile});

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('hide() drains subscriptions so handler is not called after hide', async () => {
    let {screen, events} = createScreen();
    let spy = vi.fn();

    await screen.show();
    screen.subscribe('world:wallHit', spy);
    events.emit('world:wallHit', {tile: null as unknown as MapTile});
    await screen.hide();
    events.emit('world:wallHit', {tile: null as unknown as MapTile});

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('re-show does NOT double-subscribe: one emit fires handler exactly once', async () => {
    let {screen, events} = createScreen();
    let spy = vi.fn();

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

    // The root is created once in setGame, mounted in the view, and returned
    // identically on every read.
    let uiRoot = screen.ui;

    expect(screen.ui).toBe(uiRoot);
    expect(screen.view.children).toEqual([uiRoot.view]);
  });

  test('keeps the UI root above content added through addToView', () => {
    let {screen} = createScreen();
    let uiRoot = screen.ui;
    let worldView = new Container();

    screen.addToView({view: worldView as unknown as pixiTypes.Container, update() {}});

    expect(screen.view.children.at(-1)).toBe(uiRoot.view);
  });

  test('update drives the UI root', () => {
    let {screen} = createScreen();
    let spy = vi.spyOn(screen.ui, 'update');

    screen.update({} as pixiTypes.Ticker);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('hide clears focus', async () => {
    let {screen} = createScreen();
    let spy = vi.spyOn(screen.ui, 'clearFocus');

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

describe('GameScreen.destroy', () => {
  test('drains subscriptions so handler is not called after destroy', () => {
    let {screen, events} = createScreen();
    let spy = vi.fn();

    screen.subscribe('world:wallHit', spy);
    screen.destroy();
    events.emit('world:wallHit', {tile: null as unknown as MapTile});

    expect(spy).not.toHaveBeenCalled();
  });

  test('disposes the ui root', () => {
    let {screen} = createScreen();
    let spy = vi.spyOn(screen.ui, 'destroy');

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
    let onHide = vi.fn();
    let {screen} = createScreen({onHide});

    await screen.show();
    await screen.hide();

    await expect(screen.hide()).resolves.toBeUndefined();
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  test('hide() before any show() is a no-op', async () => {
    let onHide = vi.fn();
    let {screen} = createScreen({onHide});

    await expect(screen.hide()).resolves.toBeUndefined();
    expect(onHide).not.toHaveBeenCalled();
  });

  test('show() after hide() re-arms hide()', async () => {
    let onHide = vi.fn();
    let {screen} = createScreen({onHide});

    await screen.show();
    await screen.hide();
    await screen.show();
    await screen.hide();

    expect(onHide).toHaveBeenCalledTimes(2);
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

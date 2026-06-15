import type * as pixiTypes from 'pixi.js';
import {describe, expect, test, vi} from 'vitest';

import {type Game} from '../source/engine/app/Game.js';

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

function createScreen() {
  let screen = new GameScreen({});

  screen.setGame({
    app: {ticker: {add: vi.fn(), remove: vi.fn()}},
  } as unknown as Game);

  return screen;
}

describe('GameScreen.ui', () => {
  test('creates the UI root lazily and only once', () => {
    let screen = createScreen();

    expect(screen.view.children).toHaveLength(0);

    // Read the getter into a local, then read it again below to assert the
    // lazily-created root is returned identically on the second access.
    // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- second getter call is the assertion
    let ui = screen.ui;

    expect(screen.ui).toBe(ui);
    expect(screen.view.children).toEqual([ui.view]);
  });

  test('keeps the UI root above content added through addToView', () => {
    let screen = createScreen();
    // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- screen.view is read again below
    let ui = screen.ui;
    let worldView = new Container();

    screen.addToView({view: worldView as unknown as pixiTypes.Container, update() {}});

    expect(screen.view.children.at(-1)).toBe(ui.view);
  });

  test('update drives the UI root', () => {
    let screen = createScreen();
    let spy = vi.spyOn(screen.ui, 'update');

    screen.update({} as pixiTypes.Ticker);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('hide clears focus', async () => {
    let screen = createScreen();
    let spy = vi.spyOn(screen.ui, 'clearFocus');

    await screen.hide();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('a screen that never touched ui still updates and hides safely', async () => {
    let screen = createScreen();

    screen.update({} as pixiTypes.Ticker);

    await expect(screen.hide()).resolves.toBeUndefined();
  });
});

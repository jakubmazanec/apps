import {Container} from 'pixi.js';
import {beforeEach, describe, expect, test, vitest} from 'vitest';

import {type Game} from '../source/engine/app/Game.js';
import {GameScreen} from '../source/engine/app/GameScreen.js';

// `as never`: both real classes are nominally typed (they have #private fields),
// so no structural stand-in can satisfy the mocked module's declared shape.
vitest.mock(import('../source/engine/ui/UiRoot.js'), () => ({
  UiRoot: class UiRoot {
    clearFocus = vitest.fn<() => void>();
    destroy = vitest.fn<() => void>();
    update = vitest.fn<() => void>();
    view = new Container();
  } as never,
}));

vitest.mock(import('../source/engine/scheduler/Scheduler.js'), () => ({
  Scheduler: class Scheduler {
    clear = vitest.fn<() => void>();
    update = vitest.fn<() => void>();
  } as never,
}));

let fakeGame = {} as unknown as Game;

describe('GameScreen lifecycle state', () => {
  let onHide = vitest.fn<() => void>();

  beforeEach(() => {
    onHide = vitest.fn<() => void>();
  });

  test('starts in created', () => {
    let screen = new GameScreen({});

    expect(screen.state).toBe('created');
  });

  test('attach moves it to attached', () => {
    let screen = new GameScreen({});

    screen.attach(fakeGame);

    expect(screen.state).toBe('attached');
  });

  test('attaching twice throws', () => {
    let screen = new GameScreen({});

    screen.attach(fakeGame);

    expect(() => {
      screen.attach(fakeGame);
    }).toThrow('Screen is already attached to a game!');
  });

  test('show moves it to shown and hide moves it back', async () => {
    let screen = new GameScreen({onHide});

    screen.attach(fakeGame);
    await screen.show();

    expect(screen.state).toBe('shown');

    await screen.hide();

    expect(screen.state).toBe('attached');
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  test('hide before any show is a no-op and does not run onHide', async () => {
    let screen = new GameScreen({onHide});

    screen.attach(fakeGame);
    await screen.hide();

    expect(screen.state).toBe('attached');
    expect(onHide).not.toHaveBeenCalled();
  });

  test('showing an unattached screen throws', async () => {
    let screen = new GameScreen({});

    await expect(screen.show()).rejects.toThrow("Screen can't be shown");
  });

  test('showing twice without an intervening hide is a no-op', async () => {
    let screen = new GameScreen({});

    screen.attach(fakeGame);
    await screen.show();

    expect(screen.state).toBe('shown');
    await expect(screen.show()).resolves.toBeUndefined();
    expect(screen.state).toBe('shown');
  });
});

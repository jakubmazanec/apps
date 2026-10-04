import {createRoot, type Root} from 'react-dom/client';
import {type Game} from 'tellurion';
import {afterEach, beforeEach, describe, expect, test, vitest} from 'vitest';

import Index from '../source/routes/_index.js';

const FAILURE_TEXT = 'Foam could not start. Reload the page, or try another browser.';
// vitest.mock is hoisted above the imports, so the state it shares with the
// test is hoisted as well. `reject` is set when the route calls init().
const boot = vitest.hoisted((): {reject: ((error: Error) => void) | null} => ({reject: null}));

// The route only calls init(), so the stub is cast to the real type.
vitest.mock(import('../source/game/core/game.js'), () => ({
  game: {
    init: async () =>
      new Promise<void>((_resolve, reject) => {
        boot.reject = reject;
      }),
  } as unknown as Game,
}));

describe('boot failure', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    vitest.restoreAllMocks();
  });

  test('the page says so when the game cannot start', async () => {
    let consoleError = vitest.spyOn(console, 'error').mockImplementation(() => {});
    let error = new Error('WebGL is not available');

    root.render(<Index />);

    await expect.poll(() => container.textContent).toBe('Loading…');

    await vitest.waitFor(
      () => {
        expect(boot.reject).not.toBeNull();
      },
      {timeout: 20_000},
    );

    boot.reject?.(error);

    await expect.poll(() => container.textContent).toBe(FAILURE_TEXT);

    expect(container.querySelector('canvas')).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(error);
  });
});

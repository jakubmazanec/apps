import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, test, vitest} from 'vitest';

import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import Index from '../source/routes/_index.js';

const FAILURE_TEXT = 'Foam could not start. Reload the page, or try another browser.';

// A picture shader that does not compile fails in the constructor of the
// night screen's picture, which addScreen runs through onAttach. The GLSL
// has its text as its type, so the broken text is cast to it.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), () => ({
  barPicture: 'this is not GLSL' as typeof barPictureValue,
}));

describe('boot failure of a broken picture shader', () => {
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

  test('the page says so when the picture shader does not compile', async () => {
    let consoleError = vitest.spyOn(console, 'error').mockImplementation(() => {});

    root.render(<Index />);

    await expect.poll(() => container.textContent, {timeout: 20_000}).toBe(FAILURE_TEXT);

    expect(container.querySelector('canvas')).toBeNull();

    let error: unknown = consoleError.mock.calls[0]?.[0];

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Picture shader failed to compile/);
  }, 30_000);
});

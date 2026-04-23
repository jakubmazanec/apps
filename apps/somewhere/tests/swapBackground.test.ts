import {type LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';
import {describe, expect, test, vitest} from 'vitest';

import {swapBackground} from '../source/engine/ui/swapBackground.js';

function fakeContainer(width: number, height: number) {
  return {
    width,
    height,
    setSize: vitest.fn<(width: number, height: number) => void>(),
  };
}

function fakeView(background: unknown) {
  let removeChild = vitest.fn<(value: unknown) => void>();
  let addChildAt = vitest.fn<(value: unknown, index: number) => void>();
  let view = {
    background,
    containerMethods: {removeChild, addChildAt},
  };

  return {removeChild, addChildAt, view};
}

describe(swapBackground, () => {
  // States the caller left unspecified resolve to one shared container, so two
  // states routinely map to the same object; removing and re-adding the live
  // background would be a detach/reattach for nothing.
  test('the same container in is left alone', () => {
    let shared = fakeContainer(10, 10);
    let {removeChild, addChildAt, view} = fakeView(shared);

    swapBackground(view as unknown as LayoutContainer, shared as unknown as pixi.Container);

    expect(removeChild).not.toHaveBeenCalled();
    expect(addChildAt).not.toHaveBeenCalled();
    expect(view.background).toBe(shared);
  });

  test('a different container swaps the background', () => {
    let previous = fakeContainer(10, 20);
    let next = fakeContainer(0, 0);
    let {removeChild, addChildAt, view} = fakeView(previous);

    swapBackground(view as unknown as LayoutContainer, next as unknown as pixi.Container);

    expect(removeChild).toHaveBeenCalledWith(previous);
    expect(addChildAt).toHaveBeenCalledWith(next, 0);
    expect(view.background).toBe(next);
    expect(next.setSize).toHaveBeenCalledWith(10, 20);
  });
});

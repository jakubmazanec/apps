import type * as pixi from 'pixi.js';
import {describe, expect, test, vi} from 'vitest';

vi.mock('pixi.js', () => ({
  Container: class Container {
    layout: unknown;

    addChild() {
      return this;
    }

    removeChild() {
      return this;
    }

    destroy() {}
  },
}));

const {Container} = await import('../source/engine/ui/Container.js');

describe('Container children', () => {
  test('keeps added children in a public children array', () => {
    let first = {view: {} as unknown as pixi.Container};
    let second = {view: {} as unknown as pixi.Container};
    let container = new Container({children: [first]});

    container.addChild(second);

    expect(container.children).toEqual([first, second]);

    container.removeChild(first);

    expect(container.children).toEqual([second]);
  });
});

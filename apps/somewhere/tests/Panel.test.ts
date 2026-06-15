import type * as pixi from 'pixi.js';
import {describe, expect, test, vi} from 'vitest';

vi.mock('@pixi/layout/components', () => ({
  LayoutContainer: class LayoutContainer {
    background: unknown;
    layout: unknown;

    constructor(options?: {background?: unknown}) {
      this.background = options?.background;
    }

    addChild() {
      return this;
    }

    removeChild() {
      return this;
    }

    destroy() {}
  },
}));

const {Panel} = await import('../source/engine/ui/Panel.js');

describe('Panel children', () => {
  test('keeps added children in a public children array', () => {
    let first = {view: {} as unknown as pixi.Container};
    let second = {view: {} as unknown as pixi.Container};
    let panel = new Panel({children: [first]});

    panel.addChild(second);

    expect(panel.children).toEqual([first, second]);

    panel.removeChild(first);

    expect(panel.children).toEqual([second]);
  });
});

import type * as pixi from 'pixi.js';
import {describe, expect, test, vi} from 'vitest';

vi.mock('pixi.js', () => ({
  Rectangle: class Rectangle {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
  },
}));

vi.mock('@pixi/layout/components', () => ({
  LayoutContainer: class LayoutContainer {
    eventMode = 'auto';
    cursor = 'auto';
    background: unknown;
    hitArea: unknown;
    handlers: Record<string, (argument?: unknown) => void> = {};
    containerMethods = {removeChild() {}, removeChildren() {}, addChildAt() {}};

    #style: Record<string, unknown> = {};

    constructor(options?: {background?: unknown}) {
      this.background = options?.background;
    }

    set layout(value: Record<string, unknown>) {
      this.#style = {...this.#style, ...value};
    }

    get layout() {
      return this.#style;
    }

    on(event: string, callback: (argument?: unknown) => void) {
      this.handlers[event] = callback;

      return this;
    }

    destroy() {}
  },
}));

const {Toggle} = await import('../source/engine/ui/Toggle.js');

function background() {
  return {
    width: 32,
    height: 32,
    destroyed: false,
    destroy() {},
  } as unknown as pixi.Container;
}

describe('Toggle', () => {
  // The state backgrounds are swapped in and out of the view, and a freshly
  // attached child's transform is stale until the next render, so hit testing
  // must not depend on the background children.
  test('sizes its hit area from the computed layout', () => {
    let toggle = new Toggle({backgrounds: {unchecked: background(), checked: background()}});
    let view = toggle.view as unknown as {
      hitArea: {width: number; height: number};
      handlers: Record<string, (argument?: unknown) => void>;
    };

    view.handlers.layout?.({computedLayout: {width: 32, height: 32}});

    expect(view.hitArea).toMatchObject({width: 32, height: 32});
  });
});

describe('Toggle focus', () => {
  test('is focusable unless disabled', () => {
    let toggle = new Toggle({backgrounds: {unchecked: background(), checked: background()}});

    expect(toggle.isFocusable).toBeTruthy();
    expect(toggle.isDisabled).toBeFalsy();

    toggle.disable();

    expect(toggle.isFocusable).toBeFalsy();
    expect(toggle.isDisabled).toBeTruthy();
  });

  test('activate flips the value and fires onChange', () => {
    let onChange = vi.fn();
    let toggle = new Toggle({
      backgrounds: {unchecked: background(), checked: background()},
      onChange,
    });

    toggle.activate();

    expect(toggle.isChecked).toBeTruthy();
    expect(onChange).toHaveBeenCalledWith(toggle);

    toggle.activate();

    expect(toggle.isChecked).toBeFalsy();
  });

  test('check and uncheck set the value without firing onChange', () => {
    let onChange = vi.fn();
    let toggle = new Toggle({
      backgrounds: {unchecked: background(), checked: background()},
      onChange,
    });

    toggle.check();

    expect(toggle.isChecked).toBeTruthy();

    toggle.uncheck();

    expect(toggle.isChecked).toBeFalsy();
    expect(onChange).not.toHaveBeenCalled();
  });

  test('activate is a no-op while disabled', () => {
    let onChange = vi.fn();
    let toggle = new Toggle({
      backgrounds: {unchecked: background(), checked: background()},
      onChange,
    });

    toggle.disable();
    toggle.activate();

    expect(toggle.isChecked).toBeFalsy();
    expect(onChange).not.toHaveBeenCalled();
  });
});

import type * as pixi from 'pixi.js';
import {describe, expect, test, vi} from 'vitest';

// Mirror @pixi/layout's LayoutContainer: assigning `layout` MERGES onto the
// current style (its formatStyles does `{...current, ...new}`) rather than
// replacing it. The press-offset bug only reproduces under merge semantics, so
// the mock must merge too.
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
    containerMethods = {removeChild() {}, addChildAt() {}};

    #style: Record<string, unknown> = {};

    constructor(options?: {background?: unknown}) {
      this.background = options?.background;
    }

    set layout(value: Record<string, unknown>) {
      this.#style = {...this.#style, ...value};
    }

    // The real getter returns a Layout instance whose `style` holds the merged
    // user styles.
    get layout() {
      return {style: this.#style};
    }

    on(event: string, callback: (argument?: unknown) => void) {
      this.handlers[event] = callback;

      return this;
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

const {Button} = await import('../source/engine/ui/Button.js');

function background() {
  return {
    width: 10,
    height: 10,
    destroyed: false,
    setSize() {},
    destroy() {},
  } as unknown as pixi.Container;
}

describe('Button layout defaults', () => {
  test('centers its content by default', () => {
    let button = new Button({backgrounds: {normal: background()}});

    expect(button.view.layout?.style).toMatchObject({
      justifyContent: 'center',
      alignItems: 'center',
    });
  });

  test('caller layout overrides the centering defaults', () => {
    let button = new Button({
      backgrounds: {normal: background()},
      layout: {alignItems: 'flex-end'},
    });

    expect(button.view.layout?.style).toMatchObject({
      justifyContent: 'center',
      alignItems: 'flex-end',
    });
  });

  // The state backgrounds are swapped in and out of the view, and a freshly
  // attached child's transform is stale until the next render, so hit testing
  // must not depend on the background children.
  test('sizes its hit area from the computed layout', () => {
    let button = new Button({backgrounds: {normal: background()}});
    let view = button.view as unknown as {
      hitArea: {width: number; height: number};
      handlers: Record<string, (argument?: unknown) => void>;
    };

    view.handlers.layout?.({computedLayout: {width: 208, height: 64}});

    expect(view.hitArea).toMatchObject({width: 208, height: 64});
  });
});

describe('Button press offset', () => {
  test('shifts content down on press and restores it on release', () => {
    let button = new Button({
      backgrounds: {normal: background(), hovered: background(), active: background()},
      pressOffset: 4,
      layout: {padding: 8, alignItems: 'center', justifyContent: 'center'},
    });
    let view = button.view as unknown as {
      handlers: {pointerdown: () => void; pointerup: () => void};
      layout: {style: {paddingTop?: number; paddingBottom?: number}};
    };

    view.handlers.pointerdown();

    expect(view.layout.style.paddingTop).toBe(12);
    expect(view.layout.style.paddingBottom).toBe(4);

    view.handlers.pointerup();

    expect(view.layout.style.paddingTop).toBe(8);
    expect(view.layout.style.paddingBottom).toBe(8);
  });
});

describe('Button focus', () => {
  test('keeps added children in a public children array', () => {
    let label: {view: pixi.Container} = {view: {} as unknown as pixi.Container};
    let button = new Button({backgrounds: {normal: background()}, children: [label]});

    expect(button.children).toEqual([label]);

    button.removeChild(label);

    expect(button.children).toEqual([]);
  });

  test('destroy() cascades to child components', () => {
    let child = {view: {} as unknown as pixi.Container, destroy: vi.fn()};
    let button = new Button({backgrounds: {normal: background()}, children: [child]});

    button.destroy();

    expect(child.destroy).toHaveBeenCalledTimes(1);
  });

  test('is focusable unless disabled', () => {
    let button = new Button({backgrounds: {normal: background(), disabled: background()}});

    expect(button.isFocusable).toBeTruthy();
    expect(button.isDisabled).toBeFalsy();

    button.disable();

    expect(button.isFocusable).toBeFalsy();
    expect(button.isDisabled).toBeTruthy();

    button.enable();

    expect(button.isFocusable).toBeTruthy();
    expect(button.isDisabled).toBeFalsy();
  });

  test('activate fires onClick', () => {
    let onClick = vi.fn();
    let button = new Button({backgrounds: {normal: background()}, onClick});

    button.activate();

    expect(onClick).toHaveBeenCalledWith(button);
  });

  test('activate is a no-op while disabled', () => {
    let onClick = vi.fn();
    let button = new Button({backgrounds: {normal: background(), disabled: background()}, onClick});

    button.disable();
    button.activate();

    expect(onClick).not.toHaveBeenCalled();
  });
});

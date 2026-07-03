import type * as pixi from 'pixi.js';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

vi.mock('@pixi/layout/components', () => ({
  LayoutContainer: class LayoutContainer {
    // The real LayoutContainer makes itself an interactive hit target in its
    // constructor (for its scroll trackpad).
    eventMode = 'static';
    cursor = 'auto';
    layout: unknown = {};
    background: unknown;
    children: unknown[] = [];
    hitArea: unknown;
    handlers: Record<string, (argument: unknown) => void> = {};

    on(event: string, callback: (argument: unknown) => void) {
      this.handlers[event] = callback;

      return this;
    }

    addChild(...children: unknown[]) {
      this.children.push(...children);

      return this;
    }

    removeChildren() {
      this.children.length = 0;
    }

    getGlobalPosition() {
      return {x: 0, y: 0};
    }

    destroy() {}
  },
}));

vi.mock('pixi.js', () => ({
  Rectangle: class Rectangle {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
  },
  Sprite: class Sprite {
    tint = 0xffffff;
    alpha = 1;
    layout: unknown = {};

    destroy() {}
  },
  Texture: {WHITE: {}},
  Ticker: {shared: {add() {}, remove() {}}},
}));

vi.mock('../source/engine/ui/Text.js', () => ({
  Text: class Text {
    view = {alpha: 1};

    setText() {
      return this;
    }

    destroy() {}
  },
}));

// Imported after the mocks so it picks up the mocked Pixi surface.
const {TextInput} = await import('../source/engine/ui/TextInput.js');

describe('TextInput', () => {
  let container: HTMLElement;

  function createInput(layout?: object) {
    return new TextInput({
      backgrounds: {normal: {destroy() {}} as unknown as pixi.Container},
      container,
      fontFamily: 'monogram',
      fontSize: 16,
      ...(layout === undefined ? {} : {layout}),
    });
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  test('attaches the global pointerdown listener once, not per edit cycle', () => {
    let addSpy = vi.spyOn(globalThis, 'addEventListener');
    let input = createInput();

    expect(addSpy.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(1);

    input.startEditing();
    input.stopEditing();
    input.startEditing();
    input.stopEditing();

    expect(addSpy.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(1);
  });

  test('removes the global pointerdown listener on destroy', () => {
    let removeSpy = vi.spyOn(globalThis, 'removeEventListener');
    let input = createInput();

    expect(removeSpy.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(0);

    input.destroy();

    expect(removeSpy.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(1);
  });

  test('the inner row is not an interactive hit target, so the text cursor covers the whole field', () => {
    let input = createInput();

    // Pixi takes the canvas cursor from the deepest interactive hit target
    // only; an interactive cursor-less row would override the view's 'text'
    // cursor wherever the text covers the field.
    let [row] = input.view.children as Array<{eventMode?: string}>;

    expect(row).toBeDefined();
    expect(['static', 'dynamic']).not.toContain(row?.eventMode);
  });

  test('centers its content by default', () => {
    let input = createInput();

    expect(input.view.layout).toMatchObject({justifyContent: 'center', alignItems: 'center'});
  });

  test('caller layout overrides the centering defaults', () => {
    let input = createInput({alignItems: 'flex-start'});

    expect(input.view.layout).toMatchObject({justifyContent: 'center', alignItems: 'flex-start'});
  });

  // The state backgrounds are swapped in and out of the view, and a freshly
  // attached child's transform is stale until the next render, so hit testing
  // must not depend on the background children.
  test('sizes its hit area from the computed layout', () => {
    let input = createInput();
    let view = input.view as unknown as {
      hitArea: {width: number; height: number};
      handlers: Record<string, (argument: unknown) => void>;
    };

    view.handlers.layout?.({computedLayout: {width: 220, height: 80}});

    expect(view.hitArea).toMatchObject({width: 220, height: 80});
  });

  test('a global pointerdown blurs the input only while editing', () => {
    let input = createInput();
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    let blurSpy = vi.spyOn(element, 'blur');

    globalThis.dispatchEvent(new Event('pointerdown'));

    expect(blurSpy).not.toHaveBeenCalled();

    input.startEditing();
    globalThis.dispatchEvent(new Event('pointerdown'));

    expect(blurSpy).toHaveBeenCalledWith();
  });

  test('a pointerdown on the input itself does not stop editing', () => {
    let input = createInput();
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    let blurSpy = vi.spyOn(element, 'blur');
    let view = input.view as unknown as {handlers: Record<string, (argument: unknown) => void>};

    input.startEditing();

    // The same native tap: the federated pointerdown reaches the view first,
    // then the global listener runs for that same event.
    view.handlers.pointerdown?.({stopPropagation() {}, preventDefault() {}});
    globalThis.dispatchEvent(new Event('pointerdown'));

    expect(blurSpy).not.toHaveBeenCalled();
  });

  test('a pointerdown elsewhere still stops editing', () => {
    let input = createInput();
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    let blurSpy = vi.spyOn(element, 'blur');

    input.startEditing();
    globalThis.dispatchEvent(new Event('pointerdown'));

    expect(blurSpy).toHaveBeenCalledWith();
  });

  test('is focusable unless disabled', () => {
    let input = createInput();

    expect(input.isFocusable).toBeTruthy();
    expect(input.isDisabled).toBeFalsy();

    input.disable();

    expect(input.isFocusable).toBeFalsy();
    expect(input.isDisabled).toBeTruthy();
  });

  test('activate starts editing in the hidden input', () => {
    let input = createInput();
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    let focusSpy = vi.spyOn(element, 'focus');

    input.activate();

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  test('activate is a no-op while disabled', () => {
    let input = createInput();
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    let focusSpy = vi.spyOn(element, 'focus');

    input.disable();
    input.activate();

    expect(focusSpy).not.toHaveBeenCalled();
  });
});

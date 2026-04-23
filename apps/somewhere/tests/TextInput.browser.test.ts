import {LayoutSystem} from '@pixi/layout';
import * as pixi from 'pixi.js';
import {afterEach, beforeAll, beforeEach, describe, expect, test, vitest} from 'vitest';

import {createBackground} from '../source/engine/ui/createBackground.js';
import {createTestTheme} from './createTestTheme.js';

// A fixed advance per character, so the expected caret offsets stay arithmetic;
// the real measurement is covered against the shipped font in Text.browser.test.ts.
const {CHARACTER_WIDTH} = vitest.hoisted(() => ({CHARACTER_WIDTH: 6}));

vitest.mock(import('../source/engine/ui/Text.js'), async () => {
  let {Container} = await import('pixi.js');

  return {
    // `as never`: the real Text is nominally typed (it has #private fields), so no
    // structural stand-in can satisfy the mocked module's declared shape.
    Text: class Text {
      view = new Container();

      destroy() {
        this.view.destroy();
      }

      measureWidth(text: string) {
        return text.length * CHARACTER_WIDTH;
      }

      setText() {
        return this;
      }
    } as never,
  };
});

vitest.mock(import('../source/engine/ui/createBackground.js'), () => ({
  createBackground: vitest.fn<typeof createBackground>(() => background()),
}));

// Imported after the mocks so it picks up the mocked Pixi surface.
const {TextInput} = await import('../source/engine/ui/TextInput.js');
let layoutSystem: LayoutSystem;

function background() {
  return new pixi.Container();
}

// The caret is the only sprite in the tree: the backgrounds and the mocked Texts
// are all plain containers.
function findCaret(container: pixi.Container): pixi.Sprite | undefined {
  if (container instanceof pixi.Sprite) {
    return container;
  }

  for (let child of container.children) {
    let found = findCaret(child);

    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

// @pixi/layout treats a container's own x as an offset from where it lays the
// container out and folds the computed position into the local transform, so
// that transform — not x, and not getGlobalPosition — is where the caret really
// sits. The row it belongs to starts at the field's left edge.
function caretOffsetOf(view: pixi.Container): number {
  let caret = caretOf(view);

  caret.updateLocalTransform();

  return caret.localTransform.tx;
}

// One ticker frame at the 60 fps the deltaTime scale is defined against.
const FRAME_MS = 1000 / 60;

// Ticker.shared is a module-level singleton whose clock only moves forward, so a
// test that drove it from performance.now() would leave it ahead of the next
// test's and silently no-op there. A step is clamped to maxElapsedMS, so 100 ms
// is the largest useful one (6 frames).
function tick(steps = 1, stepMs = 100) {
  for (let step = 0; step < steps; step++) {
    pixi.Ticker.shared.update(pixi.Ticker.shared.lastTime + stepMs);
  }
}

function caretWidthOf(view: pixi.Container): number {
  return (caretOf(view).layout as unknown as {computedLayout: {width: number}}).computedLayout
    .width;
}

function caretOf(view: pixi.Container): pixi.Sprite {
  let caret = findCaret(view);

  if (caret === undefined) {
    throw new Error('caret sprite was not created');
  }

  return caret;
}

describe('TextInput', () => {
  let container: HTMLElement;

  function createInput(layout?: object, onChange?: () => void) {
    return new TextInput({
      backgrounds: {normal: background()},
      container,
      fontFamily: 'monogram',
      fontSize: 16,
      ...(layout === undefined ? {} : {layout}),
      ...(onChange === undefined ? {} : {onChange}),
    });
  }

  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    // init() loads yoga (asynchronously); the real LayoutContainer's layout
    // mixin constructs a yoga node per container, so nothing may build a
    // TextInput before it resolves.
    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    vitest.restoreAllMocks();
  });

  test('attaches the global pointerdown listener only while editing', () => {
    let addSpy = vitest.spyOn(globalThis, 'addEventListener');
    let removeSpy = vitest.spyOn(globalThis, 'removeEventListener');
    let input = createInput();
    let added = () => addSpy.mock.calls.filter(([type]) => type === 'pointerdown').length;
    let removed = () => removeSpy.mock.calls.filter(([type]) => type === 'pointerdown').length;

    // An idle input holds no app-wide listener.
    expect(added()).toBe(0);

    input.startEditing();

    expect(added()).toBe(1);
    expect(removed()).toBe(0);

    input.stopEditing();

    expect(added()).toBe(1);
    expect(removed()).toBe(1);

    // A second edit cycle attaches and detaches again, staying balanced.
    input.startEditing();
    input.stopEditing();

    expect(added()).toBe(2);
    expect(removed()).toBe(2);
  });

  test('removes the global pointerdown listener when destroyed mid-edit', () => {
    let removeSpy = vitest.spyOn(globalThis, 'removeEventListener');
    let input = createInput();

    input.startEditing();
    input.destroy();

    expect(removeSpy.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(1);
  });

  test('the inner row is not an interactive hit target, so the text cursor covers the whole field', () => {
    let input = createInput();
    // Pixi takes the canvas cursor from the deepest interactive hit target
    // only; an interactive cursor-less row would override the view's 'text'
    // cursor wherever the text covers the field. LayoutContainer.addChild
    // routes content children into its overflowContainer.
    let row = input.view.overflowContainer.children.find(
      (child) => (child as {eventMode?: string}).eventMode === 'none',
    ) as {eventMode?: string} | undefined;

    expect(row).toBeDefined();
    expect(['static', 'dynamic']).not.toContain(row?.eventMode);
  });

  // The view is a row (@pixi/layout defaults flexDirection to 'row'), so
  // justifyContent is the horizontal axis: the value starts at the left edge, as
  // text fields customarily do, and only the vertical axis is centered.
  test('left-aligns its content by default', () => {
    let input = createInput();

    // With the real @pixi/layout mixin installed, `view.layout` is the Layout
    // object; the merged style lives at layout.style.
    expect((input.view.layout as unknown as {style: Record<string, unknown>}).style).toMatchObject({
      justifyContent: 'flex-start',
      alignItems: 'center',
    });
  });

  test('caller layout overrides the alignment defaults', () => {
    let input = createInput({alignItems: 'flex-start'});

    expect((input.view.layout as unknown as {style: Record<string, unknown>}).style).toMatchObject({
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
    });
  });

  // The state backgrounds are swapped in and out of the view, and a freshly
  // attached child's transform is stale until the next render, so hit testing
  // must not depend on the background children.
  test('sizes its hit area from the computed layout', () => {
    // Explicit art-px dimensions make the yoga-computed layout deterministic:
    // the root styles them verbatim, and update() then emits 'layout' with
    // those computed dimensions (throttle: 0 runs it synchronously).
    let input = createInput({width: 220, height: 80});
    let view = input.view as unknown as {hitArea: {width: number; height: number}};

    layoutSystem.update(input.view);

    expect(view.hitArea).toMatchObject({width: 220, height: 80});
  });

  test('a global pointerdown blurs the input only while editing', () => {
    let input = createInput();
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    let blurSpy = vitest.spyOn(element, 'blur');

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

    let blurSpy = vitest.spyOn(element, 'blur');
    let {view} = input;

    input.startEditing();

    // The same native tap: the federated pointerdown reaches the view first,
    // then the global listener runs for that same event. The real event needs
    // a global point for the LayoutContainer trackpad handlers, which
    // short-circuit outside the (zero-sized) scroll bounds.
    view.emit('pointerdown', {
      global: {x: -1000, y: -1000},
      stopPropagation() {},
      preventDefault() {},
    } as never);
    globalThis.dispatchEvent(new Event('pointerdown'));

    expect(blurSpy).not.toHaveBeenCalled();
  });

  test('the opening tap does not suppress the first outside tap', () => {
    let input = createInput();
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    let blurSpy = vitest.spyOn(element, 'blur');
    let {view} = input;

    // The tap that opens the field sets #isOwnPointerDown via the view's
    // federated pointerdown; editing then begins on pointerup. The window
    // listener is only attached now, so startEditing must clear that flag or the
    // next outside tap would be mistaken for the leftover opening tap.
    view.emit('pointerdown', {
      global: {x: -1000, y: -1000},
      stopPropagation() {},
      preventDefault() {},
    } as never);
    input.startEditing();

    globalThis.dispatchEvent(new Event('pointerdown'));

    expect(blurSpy).toHaveBeenCalledWith();
  });

  test('a pointerdown elsewhere still stops editing', () => {
    let input = createInput();
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    let blurSpy = vitest.spyOn(element, 'blur');

    input.startEditing();
    globalThis.dispatchEvent(new Event('pointerdown'));

    expect(blurSpy).toHaveBeenCalledWith();
  });

  test('is focusable unless disabled', () => {
    let input = createInput();

    expect(input.isFocusable).toBe(true);
    expect(input.isDisabled).toBe(false);

    input.disable();

    expect(input.isFocusable).toBe(false);
    expect(input.isDisabled).toBe(true);
  });

  test('activate starts editing in the hidden input', () => {
    let input = createInput();
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    let focusSpy = vitest.spyOn(element, 'focus');

    input.activate();

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  test('activate is a no-op while disabled', () => {
    let input = createInput();
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    let focusSpy = vitest.spyOn(element, 'focus');

    input.disable();
    input.activate();

    expect(focusSpy).not.toHaveBeenCalled();
  });

  test('renders the caret at the cursor, not at the end of the value', () => {
    let input = createInput({width: 220, height: 80});
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    input.startEditing();

    element.value = 'abcd';
    element.dispatchEvent(new Event('input'));

    // Arrow keys move the cursor inside the hidden input without changing its
    // value, so nothing but reading the selection back can observe the move.
    element.setSelectionRange(2, 2);

    tick();
    layoutSystem.update(input.view);

    // A block caret occupies the cell of the character it sits on, so it starts
    // exactly at that character's left edge.
    expect(caretOffsetOf(input.view)).toBe(2 * CHARACTER_WIDTH);
  });

  test('the caret covers one character cell', () => {
    let input = createInput({width: 220, height: 80});
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    input.startEditing();

    element.value = 'abcd';
    element.dispatchEvent(new Event('input'));
    element.setSelectionRange(1, 1);

    tick();
    layoutSystem.update(input.view);

    expect(caretWidthOf(input.view)).toBe(CHARACTER_WIDTH);
  });

  test('the caret is still a cell wide past the last character', () => {
    let input = createInput({width: 220, height: 80});
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    input.startEditing();

    element.value = 'abcd';
    element.dispatchEvent(new Event('input'));

    tick();
    layoutSystem.update(input.view);

    // There is no character under the caret here, so it falls back to a space's
    // advance rather than collapsing to nothing.
    expect(caretOffsetOf(input.view)).toBe(4 * CHARACTER_WIDTH);
    expect(caretWidthOf(input.view)).toBe(CHARACTER_WIDTH);
  });

  test('the caret blinks hard on and off', () => {
    let input = createInput({width: 220, height: 80});
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    input.startEditing();

    element.value = 'abcd';
    element.dispatchEvent(new Event('input'));

    let caret = caretOf(input.view);
    let seen = new Set<number>();

    // Ticker clamps a step to maxElapsedMS (100 ms), so 20 steps is ~2 s — two
    // full blink cycles.
    for (let step = 1; step <= 20; step++) {
      tick();
      seen.add(caret.alpha);
    }

    // A block covers the glyph it sits on, so it has to be either fully on or
    // fully off; fading would leave that glyph half-obscured most of the cycle.
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1]);
  });

  test('moving the caret restarts the blink lit', () => {
    let input = createInput({width: 220, height: 80});
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    input.startEditing();

    element.value = 'abcd';
    element.dispatchEvent(new Event('input'));

    let caret = caretOf(input.view);

    // Step frame by frame to the exact frame the caret goes dark, so the blink
    // phase is known rather than assumed. Bounded well above one half cycle.
    for (let frame = 0; frame < 200 && caret.alpha === 1; frame++) {
      tick(1, FRAME_MS);
    }

    expect(caret.alpha).toBe(0);

    // The cursor moves while the caret is dark: without a restart the user would
    // be left hunting for where it went.
    element.setSelectionRange(1, 1);
    tick(1, FRAME_MS);

    expect(caret.alpha).toBe(1);
  });

  test('the caret follows a character typed at the cursor', () => {
    let input = createInput({width: 220, height: 80});
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    input.startEditing();

    element.value = 'abcd';
    element.dispatchEvent(new Event('input'));
    element.setSelectionRange(2, 2);

    // Typing at a moved cursor: the browser inserts there and leaves the cursor
    // after the new character.
    element.value = 'abXcd';
    element.setSelectionRange(3, 3);
    element.dispatchEvent(new Event('input'));

    tick();
    layoutSystem.update(input.view);

    expect(input.value).toBe('abXcd');
    expect(caretOffsetOf(input.view)).toBe(3 * CHARACTER_WIDTH);
  });

  // Every state the caller leaves unspecified resolves to the `normal`
  // container, so a suite that never passes a distinct `disabled` background
  // never exercises the swap: it always short-circuits at swapBackground's
  // no-change guard.
  test('disable() swaps the view background to the disabled state', () => {
    let normal = background();
    let disabled = background();
    let input = new TextInput({
      backgrounds: {normal, disabled},
      container,
      fontFamily: 'monogram',
      fontSize: 16,
    });
    let view = input.view as unknown as {background: unknown};

    expect(view.background).toBe(normal);

    input.disable();

    expect(view.background).toBe(disabled);
  });

  test('disable() during an edit blurs the field and mutes input', () => {
    let onChange = vitest.fn<() => void>();
    let input = createInput(undefined, onChange);
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    let removeSpy = vitest.spyOn(globalThis, 'removeEventListener');

    input.startEditing();

    element.value = 'typed';
    element.dispatchEvent(new Event('input'));

    expect(onChange).toHaveBeenCalledTimes(1);

    input.disable();

    // disable() ends the edit via stopEditing(), so the window listener is gone.
    expect(removeSpy.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(1);
    expect(document.activeElement).not.toBe(element);

    element.value = 'sneaky';
    element.dispatchEvent(new Event('input'));

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('TextInput theme', () => {
  // Sentinels from createTestTheme() are structurally identical across
  // instances (same fixed names), and toHaveBeenCalledWith matches by deep
  // equality over the mock's ENTIRE call history, not just this test's calls.
  // Without this, a prior test's call with a same-shaped sentinel could make
  // a "not called with" assertion elsewhere fail spuriously.
  beforeEach(() => {
    vitest.mocked(createBackground).mockClear();
  });

  test('takes its backgrounds from the theme', () => {
    let theme = createTestTheme();
    let input = new TextInput({theme, container: document.body});
    let view = input.view as unknown as {background: unknown};

    expect(createBackground).toHaveBeenCalledWith(theme.textInput.normal);
    expect(view.background).toBeDefined();
  });
});

import type * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {type UiChild} from '../source/engine/ui/UiChild.js';

vi.mock('pixi.js', () => {
  class Container {
    children: Container[] = [];
    parent: Container | null = null;
    visible = true;
    destroyed = false;
    alpha = 1;
    eventMode = '';
    listeners: Record<string, Array<(event: unknown) => void>> = {};
    captureListeners: Record<string, Array<(event: unknown) => void>> = {};

    #layout: Record<string, unknown> | undefined;

    // @pixi/layout merges layout assignments onto the current style; the mock
    // mirrors that, or resize() would clobber the constructor's styles.
    get layout(): Record<string, unknown> | undefined {
      return this.#layout;
    }

    set layout(value: Record<string, unknown>) {
      this.#layout = {...this.#layout, ...value};
    }

    addChild(child: Container) {
      // eslint-disable-next-line no-param-reassign -- mock mirrors Pixi's parent linkage
      child.parent = this;
      this.children.push(child);

      return child;
    }

    addChildAt(child: Container, index: number) {
      // eslint-disable-next-line no-param-reassign -- mock mirrors Pixi's parent linkage
      child.parent = this;
      this.children.splice(index, 0, child);

      return child;
    }

    removeChild(child: Container) {
      let index = this.children.indexOf(child);

      if (index !== -1) {
        this.children.splice(index, 1);
        // eslint-disable-next-line no-param-reassign -- mock mirrors Pixi's parent linkage
        child.parent = null;
      }

      return child;
    }

    addEventListener(
      type: string,
      listener: (event: unknown) => void,
      options?: {capture?: boolean},
    ) {
      let store = options?.capture ? this.captureListeners : this.listeners;

      (store[type] ??= []).push(listener);
    }

    removeEventListener(
      type: string,
      listener: (event: unknown) => void,
      options?: {capture?: boolean},
    ) {
      let store = options?.capture ? this.captureListeners : this.listeners;

      store[type] = (store[type] ?? []).filter((existing) => existing !== listener);
    }

    getBounds() {
      if (this.destroyed) {
        throw new TypeError('destroyed');
      }

      return {x: 0, y: 0, width: 0, height: 0};
    }

    toLocal(point: {x: number; y: number}) {
      return point;
    }

    destroy() {
      this.destroyed = true;

      for (let child of this.children) {
        child.destroy();
      }
    }
  }

  class Graphics extends Container {
    rects: Array<{height: number; width: number; x: number; y: number}> = [];

    clear() {
      this.rects = [];

      return this;
    }

    rect(x: number, y: number, width: number, height: number) {
      this.rects.push({x, y, width, height});

      return this;
    }

    fill() {
      return this;
    }
  }

  class NineSliceSprite {
    visible = true;
    texture: unknown;

    constructor(options: {texture: unknown}) {
      this.texture = options.texture;
    }
  }

  return {Container, Graphics, NineSliceSprite, Assets: {get: vi.fn(() => ({}))}};
});

const {Modal} = await import('../source/engine/ui/Modal.js');
const {UiRoot} = await import('../source/engine/ui/UiRoot.js');
const {Scheduler} = await import('../source/engine/scheduler/Scheduler.js');
const {Container} = await import('pixi.js');

type MockContainer = {
  alpha: number;
  children: MockContainer[];
  destroyed: boolean;
  eventMode: string;
  layout: Record<string, unknown> | undefined;
};

type MockGraphics = MockContainer & {
  rects: Array<{height: number; width: number; x: number; y: number}>;
};

function tick(deltaMS: number): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

let roots: Array<{destroy: () => void}> = [];

function createRoot() {
  let root = new UiRoot();

  roots.push(root);

  return root;
}

// A focusable leaf component over a mock pixi view.
function focusable() {
  return {
    view: new Container() as unknown as pixi.Container,
    isFocusable: true,
    activate: vi.fn(),
  };
}

// A non-focusable container component (a Panel-like stub).
function panel(children: UiChild[]) {
  return {view: new Container() as unknown as pixi.Container, children};
}

describe('Modal', () => {
  afterEach(() => {
    for (let root of roots) {
      root.destroy();
    }

    roots = [];
    vi.restoreAllMocks();
  });

  test('open(ui) adds the modal as the last UI child, below the focus-ring overlay', () => {
    let root = createRoot();
    let rootView = root.view as unknown as MockContainer;
    let overlay = rootView.children[0];
    let outside = focusable();

    root.addChild(outside);

    let inside = focusable();
    let modal = new Modal({children: [panel([inside])]});

    modal.open(root);

    expect(root.children.at(-1)).toBe(modal);
    expect(rootView.children.at(-1)).toBe(overlay);
    expect(rootView.children.at(-2)).toBe(modal.view as unknown as MockContainer);
    expect(modal.state).toBe('open');
  });

  test('open(ui) traps focus inside the modal', () => {
    let root = createRoot();
    let outside = focusable();

    root.addChild(outside);

    let first = focusable();
    let second = focusable();
    let modal = new Modal({children: [panel([first, second])]});

    modal.open(root);

    root.focusNext();

    expect(root.focused).toBe(first);

    root.focusNext();

    expect(root.focused).toBe(second);

    root.focusNext();

    expect(root.focused).toBe(first); // wraps within the scope; outside is unreachable
  });

  test('open() applies initialFocus programmatically (no ring)', () => {
    let root = createRoot();
    let resume = focusable();
    let modal = new Modal({children: [panel([resume])], initialFocus: resume});

    modal.open(root);

    expect(root.focused).toBe(resume);
    expect(root.isRingVisible).toBeFalsy();
  });

  test('nothing is focused when initialFocus is omitted', () => {
    let root = createRoot();
    let inside = focusable();
    let modal = new Modal({children: [panel([inside])]});

    modal.open(root);

    expect(root.focused).toBeNull();
  });

  test('open() is a no-op unless closed', () => {
    let root = createRoot();
    let modal = new Modal({});

    modal.open(root);
    modal.open(root);

    expect(root.children.filter((child) => child === modal)).toHaveLength(1);
    expect(modal.state).toBe('open');
  });

  test('close() pops the focus scope before removing the modal and restores prior focus', () => {
    let root = createRoot();
    let outside = focusable();

    root.addChild(outside);

    let inside = focusable();
    let modal = new Modal({children: [panel([inside])]});

    root.focus(outside);
    modal.open(root);

    let popSpy = vi.spyOn(root, 'popFocusScope');
    let removeSpy = vi.spyOn(root, 'removeChild');

    modal.close();

    expect(popSpy.mock.invocationCallOrder[0]!).toBeLessThan(
      removeSpy.mock.invocationCallOrder[0]!,
    );
    expect(root.focused).toBe(outside);
    expect(root.children).not.toContain(modal);
    expect((modal.view as unknown as MockContainer).destroyed).toBe(true);
    expect(modal.state).toBe('closed');
  });

  test('close() reports initiation, fires onClose once, and later calls are no-ops', () => {
    let root = createRoot();
    let onClose = vi.fn();
    let modal = new Modal({onClose});

    modal.open(root);

    expect(modal.close()).toBe(true);
    expect(modal.close()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('destroy() tears down synchronously from any state and never fires onClose', () => {
    let root = createRoot();
    let outside = focusable();

    root.addChild(outside);

    let onClose = vi.fn();
    let modal = new Modal({children: [panel([focusable()])], onClose});

    root.focus(outside);
    modal.open(root);
    modal.destroy();

    expect(root.children).not.toContain(modal);
    expect((modal.view as unknown as MockContainer).destroyed).toBe(true);
    expect(root.focused).toBe(outside);
    expect(modal.state).toBe('closed');
    expect(onClose).not.toHaveBeenCalled();

    expect(() => {
      modal.destroy(); // idempotent
      new Modal({}).destroy(); // destroy before any open
    }).not.toThrow();
  });

  test('resize() sizes the root layout and redraws the scrim', () => {
    let modal = new Modal({});

    modal.resize(800, 600);

    expect((modal.view as unknown as MockContainer).layout).toMatchObject({
      width: 800,
      height: 600,
    });

    let scrim = (modal.view as unknown as MockContainer).children[0] as MockGraphics;

    expect(scrim.rects.at(-1)).toEqual({x: 0, y: 0, width: 800, height: 600});
  });

  test('the layout option passes through verbatim', () => {
    let modal = new Modal({layout: {justifyContent: 'center', alignItems: 'center'}});

    expect((modal.view as unknown as MockContainer).layout).toMatchObject({
      justifyContent: 'center',
      alignItems: 'center',
    });
  });

  test('the scrim is a raw interactive view child behind the content, outside children[]', () => {
    let content = panel([]);
    let modal = new Modal({children: [content], scrimAlpha: 0.7});
    let viewChildren = (modal.view as unknown as MockContainer).children;
    let scrim = viewChildren[0] as MockGraphics;

    expect(scrim.rects).toBeDefined(); // it is the Graphics scrim
    expect(scrim.alpha).toBeCloseTo(0.7);
    expect(scrim.eventMode).toBe('static');
    expect(viewChildren[1]).toBe(content.view as unknown as MockContainer);
    expect(modal.children).toEqual([content]); // the focus walk never sees the scrim
  });

  describe('fade (scheduler + fadeDuration)', () => {
    test('open() fades in: opening at alpha 0, open at alpha 1', () => {
      let root = createRoot();
      let scheduler = new Scheduler();
      let inside = focusable();
      let modal = new Modal({children: [panel([inside])], scheduler, fadeDuration: 200});
      let view = modal.view as unknown as MockContainer;

      modal.open(root);

      expect(modal.state).toBe('opening');
      expect(view.alpha).toBe(0);

      // Keys are trapped for the whole visible life of the modal, fades included.
      root.focusNext();

      expect(root.focused).toBe(inside);

      scheduler.update(tick(100));

      expect(view.alpha).toBeCloseTo(0.75); // easeOutQuad(0.5)
      expect(modal.state).toBe('opening');

      scheduler.update(tick(100));

      expect(view.alpha).toBe(1);
      expect(modal.state).toBe('open');
    });

    test('close() during opening cancels the fade-in and fades out from the current alpha', () => {
      let root = createRoot();
      let outside = focusable();

      root.addChild(outside);

      let scheduler = new Scheduler();
      let onClose = vi.fn();
      let inside = focusable();
      let modal = new Modal({
        children: [panel([inside])],
        scheduler,
        fadeDuration: 200,
        onClose,
      });
      let view = modal.view as unknown as MockContainer;

      root.focus(outside);
      modal.open(root);
      scheduler.update(tick(100)); // mid fade-in, alpha 0.75

      expect(modal.close()).toBe(true);
      expect(modal.state).toBe('closing');
      expect(view.alpha).toBeCloseTo(0.75); // no jump at close-start
      expect(root.children).toContain(modal); // still attached while fading out

      // The scope pops at close-COMPLETE, not close-start: still confined.
      root.focusNext();

      expect(root.focused).toBe(inside);

      scheduler.update(tick(200)); // fade-out completes

      expect(view.alpha).toBe(0);
      expect(modal.state).toBe('closed');
      expect(root.children).not.toContain(modal);
      expect(root.focused).toBe(outside);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('close() while already closing reports false and does not double-fire', () => {
      let root = createRoot();
      let scheduler = new Scheduler();
      let onClose = vi.fn();
      let modal = new Modal({scheduler, fadeDuration: 200, onClose});

      modal.open(root);
      scheduler.update(tick(200)); // open

      expect(modal.close()).toBe(true);
      expect(modal.close()).toBe(false);

      scheduler.update(tick(200));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('destroy() mid-fade cancels the tween and never fires onClose', () => {
      let root = createRoot();
      let scheduler = new Scheduler();
      let onClose = vi.fn();
      let modal = new Modal({scheduler, fadeDuration: 200, onClose});
      let view = modal.view as unknown as MockContainer;

      modal.open(root);
      scheduler.update(tick(100)); // mid fade-in
      modal.destroy();

      expect(modal.state).toBe('closed');
      expect(root.children).not.toContain(modal);
      expect(view.destroyed).toBe(true);

      let alphaAtDestroy = view.alpha;

      expect(() => {
        scheduler.update(tick(1000));
      }).not.toThrow();

      expect(view.alpha).toBe(alphaAtDestroy); // the tween was cancelled, not left running
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});

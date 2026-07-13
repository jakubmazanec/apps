import type * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {type UiChild} from '../source/engine/ui/UiChild.js';

vi.mock('pixi.js', () => ({
  Container: class Container {
    children: Container[] = [];
    parent: Container | null = null;
    visible = true;
    destroyed = false;
    listeners: Record<string, Array<(event: unknown) => void>> = {};
    captureListeners: Record<string, Array<(event: unknown) => void>> = {};

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
    }
  },
  NineSliceSprite: class NineSliceSprite {
    visible = true;
    width = 0;
    height = 0;
    texture: unknown;

    position = {
      x: 0,
      y: 0,
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    };

    constructor(options: {texture: unknown}) {
      this.texture = options.texture;
    }

    setSize(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  },
  Assets: {get: vi.fn(() => ({}))},
}));

const {UiRoot} = await import('../source/engine/ui/UiRoot.js');
const {Container} = await import('pixi.js');

const FOCUS_RING = {
  assetName: 'focus-ring',
  bottomHeight: 4,
  leftWidth: 4,
  padding: 8,
  rightWidth: 4,
  topHeight: 4,
};

type MockContainer = {
  addChild: (child: MockContainer) => MockContainer;
  captureListeners: Record<string, Array<(event: unknown) => void>>;
  children: MockContainer[];
  destroy: () => void;
  destroyed: boolean;
  getBounds: () => {height: number; width: number; x: number; y: number};
  listeners: Record<string, Array<(event: unknown) => void>>;
  removeChild: (child: MockContainer) => MockContainer;
};

let roots: Array<{destroy: () => void}> = [];

function createRoot(options?: ConstructorParameters<typeof UiRoot>[0]) {
  let root = new UiRoot(options);

  roots.push(root);

  return root;
}

// A focusable leaf component over a mock pixi view.
function focusable(bounds?: {height: number; width: number; x: number; y: number}) {
  let resolvedBounds = bounds ?? {x: 0, y: 0, width: 10, height: 10};
  let view = new Container() as unknown as MockContainer;

  // Destroyed pixi views null their internals, so getBounds() throws; the
  // override still needs to reflect that instead of always returning fixed bounds.
  view.getBounds = () => {
    if (view.destroyed) {
      throw new TypeError('destroyed');
    }

    return resolvedBounds;
  };

  return {
    view: view as unknown as pixi.Container,
    isFocusable: true,
    activate: vi.fn(),
  };
}

// A non-focusable container component (a Panel-like stub).
function panel(children: UiChild[]) {
  return {view: new Container() as unknown as pixi.Container, children};
}

function createRootWith(...children: UiChild[]) {
  let root = createRoot();

  root.addChild(...children);

  return root;
}

describe('UiRoot', () => {
  afterEach(() => {
    for (let root of roots) {
      root.destroy();
    }

    roots = [];
    vi.restoreAllMocks();
  });

  describe('children', () => {
    test('tracks components and keeps the focus ring overlay topmost', () => {
      let root = createRoot();
      let view = root.view as unknown as MockContainer;
      let overlay = view.children[0];
      let a = focusable();
      let b = new Container();

      root.addChild(a, b as unknown as pixi.Container);

      expect(root.children).toEqual([a, b]);
      expect(view.children).toEqual([a.view, b, overlay]);

      root.removeChild(a);

      expect(root.children).toEqual([b]);
      expect(view.children).toEqual([b, overlay]);
    });
  });

  describe('pointer interplay', () => {
    test('a tap inside a focusable component silently focuses it', () => {
      let root = createRoot();
      let view = root.view as unknown as MockContainer;
      let component = focusable();
      let inner = new Container();

      (component.view as unknown as MockContainer).addChild(inner as unknown as MockContainer);
      root.addChild(component);

      view.captureListeners.pointertap?.[0]?.({target: inner});

      expect(root.focused).toBe(component);
      expect(root.isRingVisible).toBeFalsy();
    });

    test('a tap outside any focusable changes nothing', () => {
      let root = createRoot();
      let view = root.view as unknown as MockContainer;
      let plain = new Container();

      root.addChild(plain as unknown as pixi.Container);

      view.captureListeners.pointertap?.[0]?.({target: plain});

      expect(root.focused).toBeNull();
    });

    test('a tap on a non-focusable component changes nothing', () => {
      let root = createRoot();
      let view = root.view as unknown as MockContainer;
      let component = focusable();

      component.isFocusable = false;
      root.addChild(component);

      view.captureListeners.pointertap?.[0]?.({target: component.view});

      expect(root.focused).toBeNull();
    });

    test('a tap that bubbles to the UI root is stopped before reaching the game view', () => {
      let root = createRoot();
      let view = root.view as unknown as MockContainer;
      let event = {target: null, stopPropagation: vi.fn()};

      for (let listener of view.listeners.pointertap ?? []) {
        listener(event);
      }

      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    });

    test('the root view is interactive so pixi notifies its listeners', () => {
      let root = createRoot();

      expect(root.view.eventMode).toBe('static');
    });
  });

  describe('focus ring', () => {
    test('draws the ring around the focused component after a focus command', () => {
      let root = createRoot({focusRing: FOCUS_RING});
      let view = root.view as unknown as MockContainer;
      let component = focusable({x: 100, y: 50, width: 40, height: 20});

      root.addChild(component);
      root.focusNext();
      root.update();

      let overlay = view.children.at(-1) as MockContainer;
      let ring = overlay.children[0] as unknown as {
        height: number;
        position: {x: number; y: number};
        visible: boolean;
        width: number;
      };

      expect(ring.visible).toBeTruthy();
      expect(ring.position).toMatchObject({x: 92, y: 42});
      expect(ring.width).toBe(56);
      expect(ring.height).toBe(36);
    });

    test('a global pointerdown hides the ring but keeps focus', () => {
      let root = createRoot({focusRing: FOCUS_RING});
      let view = root.view as unknown as MockContainer;
      let component = focusable();

      root.addChild(component);
      root.focusNext();
      root.update();

      globalThis.dispatchEvent(new Event('pointerdown'));
      root.update();

      let overlay = view.children.at(-1) as MockContainer;
      let ring = overlay.children[0] as unknown as {visible: boolean};

      expect(ring.visible).toBeFalsy();
      expect(root.focused).toBe(component);
    });

    test('clearFocus hides the ring and clears focus', () => {
      let root = createRoot({focusRing: FOCUS_RING});
      let view = root.view as unknown as MockContainer;
      let component = focusable();

      root.addChild(component);
      root.focusNext();
      root.update();
      root.clearFocus();
      root.update();

      let overlay = view.children.at(-1) as MockContainer;
      let ring = overlay.children[0] as unknown as {visible: boolean};

      expect(ring.visible).toBeFalsy();
      expect(root.focused).toBeNull();
    });

    test('destroy removes the global pointerdown listener', () => {
      let removeSpy = vi.spyOn(globalThis, 'removeEventListener');
      let root = new UiRoot();

      root.destroy();

      expect(removeSpy.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(1);
    });

    test('destroy() cascades to child components', () => {
      let root = new UiRoot();
      let child = {view: new Container() as unknown as pixi.Container, destroy: vi.fn()};

      root.addChild(child);
      root.destroy();

      expect(child.destroy).toHaveBeenCalledTimes(1);
    });

    test('update() does not throw when the focused view was destroyed', () => {
      let root = createRoot({focusRing: FOCUS_RING});
      let button = focusable();

      root.addChild(button);
      root.focus(button);
      root.focusNext(); // shows the ring so update() reaches getBounds()
      button.view.destroy();

      expect(() => {
        root.update();
      }).not.toThrow();
    });
  });

  describe('linear navigation', () => {
    test('the first command focuses the first focusable in tree order', () => {
      let a = focusable();
      let b = focusable();
      let root = createRootWith(a, b);

      root.focusNext();

      expect(root.focused).toBe(a);
    });

    test('follows depth-first component order and wraps around', () => {
      let a = focusable();
      let b = focusable();
      let c = focusable();
      let root = createRootWith(panel([a, b]), c);

      root.focusNext();
      root.focusNext();
      root.focusNext();

      expect(root.focused).toBe(c);

      root.focusNext();

      expect(root.focused).toBe(a);
    });

    test('focusPrevious walks backwards and wraps around', () => {
      let a = focusable();
      let b = focusable();
      let root = createRootWith(a, b);

      root.focusNext();
      root.focusPrevious();

      expect(root.focused).toBe(b);
    });

    test('skips non-focusable components and hidden subtrees', () => {
      let a = focusable();
      let b = focusable();
      let c = focusable();
      let hidden = panel([c]);
      let d = focusable();

      b.isFocusable = false;
      (hidden.view as unknown as {visible: boolean}).visible = false;

      let root = createRootWith(a, b, hidden, d);

      root.focusNext();
      root.focusNext();

      expect(root.focused).toBe(d);
    });

    test('raw Pixi containers are leaves with nothing to discover', () => {
      let a = focusable();
      let raw = new Container() as unknown as pixi.Container;
      let root = createRootWith(raw, a);

      root.focusNext();

      expect(root.focused).toBe(a);
    });

    test('commands with no focusables in scope are a no-op', () => {
      let root = createRootWith(panel([]));

      root.focusNext();

      expect(root.focused).toBeNull();
      expect(root.isRingVisible).toBeFalsy();
    });
  });

  describe('ring visibility', () => {
    test('the ring is hidden until the first focus command', () => {
      let a = focusable();
      let root = createRootWith(a);

      expect(root.isRingVisible).toBeFalsy();

      root.focusNext();

      expect(root.isRingVisible).toBeTruthy();
    });

    test('programmatic focus keeps the ring hidden', () => {
      let a = focusable();
      let root = createRootWith(a);

      root.focus(a);

      expect(root.focused).toBe(a);
      expect(root.isRingVisible).toBeFalsy();
    });

    test('a pointer press hides the ring but keeps focus', () => {
      let a = focusable();
      let root = createRootWith(a);

      root.focusNext();
      globalThis.dispatchEvent(new Event('pointerdown'));

      expect(root.isRingVisible).toBeFalsy();
      expect(root.focused).toBe(a);
    });

    test('clearFocus clears both focus and the ring', () => {
      let a = focusable();
      let root = createRootWith(a);

      root.focusNext();
      root.clearFocus();

      expect(root.focused).toBeNull();
      expect(root.isRingVisible).toBeFalsy();
    });
  });

  describe('spatial navigation', () => {
    test('the first arrow command focuses the component nearest the top-left', () => {
      let a = focusable({x: 100, y: 0, width: 10, height: 10});
      let b = focusable({x: 0, y: 50, width: 10, height: 10});
      let root = createRootWith(a, b);

      root.moveFocus('down');

      expect(root.focused).toBe(b);
      expect(root.isRingVisible).toBeTruthy();
    });

    test('prefers the component directly below over a nearer diagonal one', () => {
      let source = focusable({x: 0, y: 0, width: 40, height: 20});
      let below = focusable({x: 0, y: 60, width: 40, height: 20});
      let diagonal = focusable({x: 50, y: 30, width: 40, height: 20});
      let root = createRootWith(source, below, diagonal);

      root.focus(source);
      root.moveFocus('down');

      expect(root.focused).toBe(below);
    });

    test('moves between components in a row', () => {
      let left = focusable({x: 0, y: 0, width: 10, height: 10});
      let right = focusable({x: 100, y: 0, width: 10, height: 10});
      let root = createRootWith(left, right);

      root.focus(left);
      root.moveFocus('right');

      expect(root.focused).toBe(right);

      root.moveFocus('left');

      expect(root.focused).toBe(left);
    });

    test('does not wrap: focus stays put with no candidate in the direction', () => {
      let a = focusable({x: 0, y: 0, width: 10, height: 10});
      let b = focusable({x: 0, y: 50, width: 10, height: 10});
      let root = createRootWith(a, b);

      root.focus(a);
      root.moveFocus('up');

      expect(root.focused).toBe(a);
    });

    test('prefers a near control within the source column over a farther aligned one', () => {
      // A small control offset within a wide source's column (the toggle-under-button
      // case) should win over a wide, center-aligned control that sits farther away.
      let source = focusable({x: 0, y: 0, width: 200, height: 40});
      let near = focusable({x: 140, y: 50, width: 25, height: 25});
      let farAligned = focusable({x: 0, y: 90, width: 200, height: 50});
      let root = createRootWith(source, near, farAligned);

      root.focus(source);
      root.moveFocus('down');

      expect(root.focused).toBe(near);
    });
  });

  describe('activation', () => {
    test('activates the focused component', () => {
      let a = focusable();
      let root = createRootWith(a);

      root.focus(a);
      root.activate();

      expect(a.activate).toHaveBeenCalledTimes(1);
    });

    test('is a no-op with nothing focused', () => {
      let a = focusable();
      let root = createRootWith(a);

      root.activate();

      expect(a.activate).not.toHaveBeenCalled();
    });

    test('drops focus instead of activating a stale component', () => {
      let a = focusable();
      let root = createRootWith(a);

      root.focus(a);
      a.isFocusable = false;
      root.activate();

      expect(a.activate).not.toHaveBeenCalled();
      expect(root.focused).toBeNull();
    });
  });

  describe('stale focus', () => {
    test('an arrow command drops stale focus; the next one starts over', () => {
      let a = focusable({x: 0, y: 0, width: 10, height: 10});
      let b = focusable({x: 0, y: 50, width: 10, height: 10});
      let root = createRootWith(a, b);

      root.focus(a);
      a.isFocusable = false;
      root.moveFocus('down');

      expect(root.focused).toBeNull();

      root.moveFocus('down');

      expect(root.focused).toBe(b);
    });

    test('a Tab command drops stale focus; the next one starts over', () => {
      let a = focusable();
      let b = focusable();
      let root = createRootWith(a, b);

      root.focus(a);
      a.isFocusable = false;
      root.focusNext();

      expect(root.focused).toBeNull();

      root.focusNext();

      expect(root.focused).toBe(b);
    });

    test('removeChild drops focus held inside the removed subtree', () => {
      let a = focusable();
      let modal = panel([a]);
      let root = createRootWith(modal);

      root.focus(a);
      root.removeChild(modal);

      expect(root.focused).toBeNull();
    });

    test('Tab skips a component destroyed while still childed', () => {
      let a = focusable();
      let b = focusable();
      let c = focusable();
      let root = createRootWith(a, b, c);

      // Destroyed views stay visible === true and throw from getBounds(), so
      // without pruning the walk this would crash or focus a dead component.
      b.view.destroy();

      root.focusNext();

      expect(root.focused).toBe(a);

      root.focusNext();

      expect(root.focused).toBe(c);
    });

    test('an arrow command does not throw when a childed component was destroyed', () => {
      let a = focusable({x: 0, y: 0, width: 10, height: 10});
      let b = focusable({x: 0, y: 50, width: 10, height: 10});
      let root = createRootWith(a, b);

      root.focus(a);
      b.view.destroy();

      expect(() => {
        root.moveFocus('down');
      }).not.toThrow();

      // The destroyed component below is pruned, so there is no candidate in
      // that direction and focus stays put.
      expect(root.focused).toBe(a);
    });
  });

  describe('focus scopes', () => {
    test('push restricts traversal to the scope subtree', () => {
      let a = focusable();
      let b = focusable();
      let c = focusable();
      let modal = panel([b, c]);
      let root = createRootWith(a, modal);

      root.pushFocusScope(modal);

      root.focusNext();

      expect(root.focused).toBe(b);

      root.focusNext();
      root.focusNext();

      expect(root.focused).toBe(b);
    });

    test('pop restores the previously focused component', () => {
      let a = focusable();
      let b = focusable();
      let modal = panel([b]);
      let root = createRootWith(a, modal);

      root.focus(a);
      root.pushFocusScope(modal);

      expect(root.focused).toBeNull();

      root.focusNext();

      expect(root.focused).toBe(b);

      root.popFocusScope();

      expect(root.focused).toBe(a);
    });

    test('pop clears focus when the previous component is no longer focusable', () => {
      let a = focusable();
      let b = focusable();
      let modal = panel([b]);
      let root = createRootWith(a, modal);

      root.focus(a);
      root.pushFocusScope(modal);
      a.isFocusable = false;
      root.popFocusScope();

      expect(root.focused).toBeNull();
    });

    test('nested scopes restore one level at a time', () => {
      let a = focusable();
      let b = focusable();
      let c = focusable();
      let inner = panel([c]);
      let outer = panel([b, inner]);
      let root = createRootWith(a, outer);

      root.focus(a);
      root.pushFocusScope(outer);
      root.focusNext();

      expect(root.focused).toBe(b);

      root.pushFocusScope(inner);
      root.focusNext();

      expect(root.focused).toBe(c);

      root.popFocusScope();

      expect(root.focused).toBe(b);

      root.popFocusScope();

      expect(root.focused).toBe(a);
    });

    test('pop on an empty stack is a no-op', () => {
      let a = focusable();
      let root = createRootWith(a);

      root.focus(a);
      root.popFocusScope();

      expect(root.focused).toBe(a);
    });

    test('clearFocus also resets the scope stack', () => {
      let a = focusable();
      let b = focusable();
      let modal = panel([b]);
      let root = createRootWith(a, modal);

      root.pushFocusScope(modal);
      root.clearFocus();
      root.focusNext();

      expect(root.focused).toBe(a);
    });
  });

  describe('focus scope self-heal (out-of-band removal)', () => {
    test('removing the scoped subtree without a pop: the next focus command prunes the scope and restores previous focus', () => {
      let a = focusable();
      let b = focusable();
      let modal = panel([b]);
      let root = createRootWith(a, modal);

      root.focus(a);
      root.pushFocusScope(modal);
      root.removeChild(modal); // dismissed without a matching popFocusScope

      root.focusNext(); // assertions run after a focus command, not right after the mutation

      // The dead scope was pruned (b is unreachable) and the scope's
      // previousFocus (a) was restored; the command then moved from a and
      // wrapped back to it as the only focusable left.
      expect(root.focused).toBe(a);
    });

    test('destroying the scoped subtree in place is healed the same way', () => {
      let a = focusable();
      let b = focusable();
      let modal = panel([b]);
      let root = createRootWith(a, modal);

      root.focus(a);
      root.pushFocusScope(modal);
      (modal.view as unknown as MockContainer).destroy(); // plain destroy(), no removal

      root.focusNext();

      expect(root.focused).toBe(a);
    });

    test('deep removal (subtree detached below the ui root) is healed the same way', () => {
      let a = focusable();
      let b = focusable();
      let inner = panel([b]);
      let outer = panel([inner]);
      let root = createRootWith(a, outer);

      root.focus(a);
      root.pushFocusScope(inner);

      // Panel.removeChild-style deep removal: inner leaves outer's children
      // and view; UiRoot.removeChild is never involved.
      outer.children.splice(0, 1);
      (outer.view as unknown as MockContainer).removeChild(inner.view as unknown as MockContainer);

      root.focusNext();

      expect(root.focused).toBe(a);
    });

    test('a previousFocus that left with the subtree is dropped, not restored', () => {
      let outside = focusable();
      let a = focusable();
      let b = focusable();
      let modal = panel([a, b]);
      let root = createRootWith(outside, modal);

      root.focus(a); // the previously focused component sits inside the modal itself
      root.pushFocusScope(modal);
      root.removeChild(modal);

      root.focusNext();

      // previousFocus (a) is no longer collectible, so the heal cleared focus
      // and the command started over from the first focusable.
      expect(root.focused).toBe(outside);
    });

    test('a dead scope below a live top scope waits until it surfaces', () => {
      let a = focusable();
      let b = focusable();
      let c = focusable();
      let lower = panel([b]);
      let top = panel([c]);
      let root = createRootWith(a, lower, top);

      root.focus(a);
      root.pushFocusScope(lower);
      root.pushFocusScope(top);
      root.removeChild(lower); // the lower scope is dead; the top scope is live

      root.focusNext();

      expect(root.focused).toBe(c); // traversal still confined to the live top scope

      root.popFocusScope(); // the dead scope surfaces (top's previousFocus was null)

      expect(root.focused).toBeNull();

      root.focusNext(); // the next focus command prunes it and restores a as the start point

      // Restoration is observable through where the command moved FROM: with a
      // restored (focusables are [a, c]) the command lands on c; had the heal
      // dropped focus instead, it would have started over and landed on a.
      expect(root.focused).toBe(c);
    });
  });
});

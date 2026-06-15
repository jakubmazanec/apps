import type * as pixi from 'pixi.js';
import {describe, expect, test, vi} from 'vitest';

import {FocusManager} from '../source/engine/ui/FocusManager.js';
import {type UiChild} from '../source/engine/ui/UiChild.js';

type Bounds = {height: number; width: number; x: number; y: number};

type StubView = {
  getBounds: () => Bounds;
  parent: StubView | null;
  visible: boolean;
};

function view(bounds?: Bounds): StubView {
  let resolved = bounds ?? {x: 0, y: 0, width: 0, height: 0};

  return {getBounds: () => resolved, parent: null, visible: true};
}

// A focusable leaf component (a Button-like stub).
function focusable(bounds?: Bounds) {
  return {
    view: view(bounds) as unknown as pixi.Container,
    isFocusable: true,
    activate: vi.fn(),
  };
}

// A non-focusable container component (a Panel-like stub).
function panel(children: UiChild[]) {
  return {view: view() as unknown as pixi.Container, children};
}

function viewOf(component: {view: pixi.Container}): StubView {
  return component.view as unknown as StubView;
}

function createManager(children: UiChild[]) {
  return new FocusManager({root: panel(children)});
}

describe('linear navigation', () => {
  test('the first command focuses the first focusable in tree order', () => {
    let a = focusable();
    let b = focusable();
    let manager = createManager([a, b]);

    manager.focusNext();

    expect(manager.focused).toBe(a);
  });

  test('follows depth-first component order and wraps around', () => {
    let a = focusable();
    let b = focusable();
    let c = focusable();
    let manager = createManager([panel([a, b]), c]);

    manager.focusNext();
    manager.focusNext();
    manager.focusNext();

    expect(manager.focused).toBe(c);

    manager.focusNext();

    expect(manager.focused).toBe(a);
  });

  test('focusPrevious walks backwards and wraps around', () => {
    let a = focusable();
    let b = focusable();
    let manager = createManager([a, b]);

    manager.focusNext();
    manager.focusPrevious();

    expect(manager.focused).toBe(b);
  });

  test('skips non-focusable components and hidden subtrees', () => {
    let a = focusable();
    let b = focusable();
    let c = focusable();
    let hidden = panel([c]);
    let d = focusable();

    b.isFocusable = false;
    viewOf(hidden).visible = false;

    let manager = createManager([a, b, hidden, d]);

    manager.focusNext();
    manager.focusNext();

    expect(manager.focused).toBe(d);
  });

  test('raw Pixi containers are leaves with nothing to discover', () => {
    let a = focusable();
    let raw = view() as unknown as pixi.Container;
    let manager = createManager([raw, a]);

    manager.focusNext();

    expect(manager.focused).toBe(a);
  });

  test('commands with no focusables in scope are a no-op', () => {
    let manager = createManager([panel([])]);

    manager.focusNext();

    expect(manager.focused).toBeNull();
    expect(manager.isRingVisible).toBeFalsy();
  });
});

describe('ring visibility', () => {
  test('the ring is hidden until the first focus command', () => {
    let a = focusable();
    let manager = createManager([a]);

    expect(manager.isRingVisible).toBeFalsy();

    manager.focusNext();

    expect(manager.isRingVisible).toBeTruthy();
  });

  test('programmatic focus keeps the ring hidden', () => {
    let a = focusable();
    let manager = createManager([a]);

    manager.focus(a);

    expect(manager.focused).toBe(a);
    expect(manager.isRingVisible).toBeFalsy();
  });

  test('hideRing hides the ring but keeps focus', () => {
    let a = focusable();
    let manager = createManager([a]);

    manager.focusNext();
    manager.hideRing();

    expect(manager.isRingVisible).toBeFalsy();
    expect(manager.focused).toBe(a);
  });

  test('clearFocus clears both focus and the ring', () => {
    let a = focusable();
    let manager = createManager([a]);

    manager.focusNext();
    manager.clearFocus();

    expect(manager.focused).toBeNull();
    expect(manager.isRingVisible).toBeFalsy();
  });
});

describe('spatial navigation', () => {
  test('the first arrow command focuses the component nearest the top-left', () => {
    let a = focusable({x: 100, y: 0, width: 10, height: 10});
    let b = focusable({x: 0, y: 50, width: 10, height: 10});
    let manager = createManager([a, b]);

    manager.moveFocus('down');

    expect(manager.focused).toBe(b);
    expect(manager.isRingVisible).toBeTruthy();
  });

  test('prefers the component directly below over a nearer diagonal one', () => {
    let source = focusable({x: 0, y: 0, width: 40, height: 20});
    let below = focusable({x: 0, y: 60, width: 40, height: 20});
    let diagonal = focusable({x: 50, y: 30, width: 40, height: 20});
    let manager = createManager([source, below, diagonal]);

    manager.focus(source);
    manager.moveFocus('down');

    expect(manager.focused).toBe(below);
  });

  test('moves between components in a row', () => {
    let left = focusable({x: 0, y: 0, width: 10, height: 10});
    let right = focusable({x: 100, y: 0, width: 10, height: 10});
    let manager = createManager([left, right]);

    manager.focus(left);
    manager.moveFocus('right');

    expect(manager.focused).toBe(right);

    manager.moveFocus('left');

    expect(manager.focused).toBe(left);
  });

  test('does not wrap: focus stays put with no candidate in the direction', () => {
    let a = focusable({x: 0, y: 0, width: 10, height: 10});
    let b = focusable({x: 0, y: 50, width: 10, height: 10});
    let manager = createManager([a, b]);

    manager.focus(a);
    manager.moveFocus('up');

    expect(manager.focused).toBe(a);
  });

  test('prefers a near control within the source column over a farther aligned one', () => {
    // A small control offset within a wide source's column (the toggle-under-button
    // case) should win over a wide, center-aligned control that sits farther away.
    let source = focusable({x: 0, y: 0, width: 200, height: 40});
    let near = focusable({x: 140, y: 50, width: 25, height: 25});
    let farAligned = focusable({x: 0, y: 90, width: 200, height: 50});
    let manager = createManager([source, near, farAligned]);

    manager.focus(source);
    manager.moveFocus('down');

    expect(manager.focused).toBe(near);
  });
});

describe('activation', () => {
  test('activates the focused component', () => {
    let a = focusable();
    let manager = createManager([a]);

    manager.focus(a);
    manager.activate();

    expect(a.activate).toHaveBeenCalledTimes(1);
  });

  test('is a no-op with nothing focused', () => {
    let a = focusable();
    let manager = createManager([a]);

    manager.activate();

    expect(a.activate).not.toHaveBeenCalled();
  });

  test('drops focus instead of activating a stale component', () => {
    let a = focusable();
    let manager = createManager([a]);

    manager.focus(a);
    a.isFocusable = false;
    manager.activate();

    expect(a.activate).not.toHaveBeenCalled();
    expect(manager.focused).toBeNull();
  });
});

describe('stale focus', () => {
  test('an arrow command drops stale focus; the next one starts over', () => {
    let a = focusable({x: 0, y: 0, width: 10, height: 10});
    let b = focusable({x: 0, y: 50, width: 10, height: 10});
    let manager = createManager([a, b]);

    manager.focus(a);
    a.isFocusable = false;
    manager.moveFocus('down');

    expect(manager.focused).toBeNull();

    manager.moveFocus('down');

    expect(manager.focused).toBe(b);
  });

  test('a Tab command drops stale focus; the next one starts over', () => {
    let a = focusable();
    let b = focusable();
    let manager = createManager([a, b]);

    manager.focus(a);
    a.isFocusable = false;
    manager.focusNext();

    expect(manager.focused).toBeNull();

    manager.focusNext();

    expect(manager.focused).toBe(b);
  });
});

describe('pointer focus', () => {
  test('resolves a tapped view to its owning component and keeps the ring hidden', () => {
    let a = focusable();
    let manager = createManager([a]);
    let inner = view();

    inner.parent = viewOf(a);

    manager.focusFromPointer(inner as unknown as pixi.Container);

    expect(manager.focused).toBe(a);
    expect(manager.isRingVisible).toBeFalsy();
  });

  test('ignores taps that resolve to no component', () => {
    let a = focusable();
    let manager = createManager([a]);
    let stray = view();

    manager.focusFromPointer(stray as unknown as pixi.Container);

    expect(manager.focused).toBeNull();
  });

  test('ignores taps on non-focusable components', () => {
    let a = focusable();

    a.isFocusable = false;

    let manager = createManager([a]);

    manager.focusFromPointer(a.view);

    expect(manager.focused).toBeNull();
  });
});

describe('focus scopes', () => {
  test('push restricts traversal to the scope subtree', () => {
    let a = focusable();
    let b = focusable();
    let c = focusable();
    let modal = panel([b, c]);
    let manager = createManager([a, modal]);

    manager.pushFocusScope(modal);

    manager.focusNext();

    expect(manager.focused).toBe(b);

    manager.focusNext();
    manager.focusNext();

    expect(manager.focused).toBe(b);
  });

  test('pop restores the previously focused component', () => {
    let a = focusable();
    let b = focusable();
    let modal = panel([b]);
    let manager = createManager([a, modal]);

    manager.focus(a);
    manager.pushFocusScope(modal);

    expect(manager.focused).toBeNull();

    manager.focusNext();

    expect(manager.focused).toBe(b);

    manager.popFocusScope();

    expect(manager.focused).toBe(a);
  });

  test('pop clears focus when the previous component is no longer focusable', () => {
    let a = focusable();
    let b = focusable();
    let modal = panel([b]);
    let manager = createManager([a, modal]);

    manager.focus(a);
    manager.pushFocusScope(modal);
    a.isFocusable = false;
    manager.popFocusScope();

    expect(manager.focused).toBeNull();
  });

  test('nested scopes restore one level at a time', () => {
    let a = focusable();
    let b = focusable();
    let c = focusable();
    let inner = panel([c]);
    let outer = panel([b, inner]);
    let manager = createManager([a, outer]);

    manager.focus(a);
    manager.pushFocusScope(outer);
    manager.focusNext();

    expect(manager.focused).toBe(b);

    manager.pushFocusScope(inner);
    manager.focusNext();

    expect(manager.focused).toBe(c);

    manager.popFocusScope();

    expect(manager.focused).toBe(b);

    manager.popFocusScope();

    expect(manager.focused).toBe(a);
  });

  test('pop on an empty stack is a no-op', () => {
    let a = focusable();
    let manager = createManager([a]);

    manager.focus(a);
    manager.popFocusScope();

    expect(manager.focused).toBe(a);
  });

  test('clearFocus also resets the scope stack', () => {
    let a = focusable();
    let b = focusable();
    let modal = panel([b]);
    let manager = createManager([a, modal]);

    manager.pushFocusScope(modal);
    manager.clearFocus();
    manager.focusNext();

    expect(manager.focused).toBe(a);
  });
});

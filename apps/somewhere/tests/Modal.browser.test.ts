import type * as pixi from 'pixi.js';
import {Container, Graphics} from 'pixi.js';
import {afterEach, describe, expect, test, vitest} from 'vitest';

import {Scheduler} from '../source/engine/scheduler/Scheduler.js';
import {Modal} from '../source/engine/ui/Modal.js';
import {type UiChild} from '../source/engine/ui/UiChild.js';
import {UiRoot} from '../source/engine/ui/UiRoot.js';

// UiRoot registers its pointertap listeners via the federated event system
// (addEventListener), which pixi only installs on Container through this side
// effect.
import 'pixi.js/events';

type MockContainer = {
  alpha: number;
  children: MockContainer[];
  destroyed: boolean;
  eventMode: string;
  layout: Record<string, unknown> | undefined;
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
    view: new Container(),
    isFocusable: true,
    activate: vitest.fn<() => void>(),
    increase: vitest.fn<() => void>(),
    decrease: vitest.fn<() => void>(),
  };
}

// A non-focusable container component (a Panel-like stub).
function panel(children: UiChild[]) {
  return {view: new Container(), children};
}

describe(Modal, () => {
  afterEach(() => {
    for (let root of roots) {
      root.destroy();
    }

    roots = [];
    vitest.restoreAllMocks();
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
    expect(root.isRingVisible).toBe(false);
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

    let popSpy = vitest.spyOn(root, 'popFocusScope');
    let removeSpy = vitest.spyOn(root, 'removeChild');

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
    let onClose = vitest.fn<() => void>();
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

    let onClose = vitest.fn<() => void>();
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

    let scrim = (modal.view as unknown as MockContainer).children[0] as unknown as Graphics;

    // The real Graphics records its drawing in the context bounds: the scrim
    // is redrawn to cover exactly the resized modal.
    expect(scrim.bounds).toMatchObject({x: 0, y: 0, width: 800, height: 600});
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
    let scrim = viewChildren[0] as unknown as Graphics;

    expect(scrim instanceof Graphics).toBe(true); // it is the Graphics scrim
    expect(scrim.alpha).toBeCloseTo(0.7);
    expect(scrim.eventMode).toBe('static');
    expect(viewChildren[1]).toBe(content.view as unknown as MockContainer);
    expect(modal.children).toEqual([content]); // the focus walk never sees the scrim
  });

  test('cancel closes the modal by default', () => {
    let root = createRoot();
    let modal = new Modal({children: [panel([focusable()])]});

    modal.open(root);

    expect(root.cancel()).toBe(true);
    expect(modal.state).toBe('closed');
  });

  test('a supplied onCancel replaces the default close', () => {
    let root = createRoot();
    let calls = 0;
    let modal = new Modal({
      children: [panel([focusable()])],
      onCancel: () => {
        calls += 1;
      },
    });

    modal.open(root);

    expect(root.cancel()).toBe(true);
    expect(calls).toBe(1);
    // The handler owns the close: the pause menu resumes the world in it.
    expect(modal.state).toBe('open');
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
      let onClose = vitest.fn<() => void>();
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
      let onClose = vitest.fn<() => void>();
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
      let onClose = vitest.fn<() => void>();
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

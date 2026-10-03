import {LayoutSystem} from '@pixi/layout';
import type * as pixi from 'pixi.js';
import {Container, Graphics} from 'pixi.js';
import {afterEach, beforeAll, describe, expect, test, vitest} from 'vitest';

import {Scheduler} from '../source/scheduler/Scheduler.js';
import {Modal} from '../source/ui/Modal.js';
import {type UiChild} from '../source/ui/UiChild.js';
import {UiRoot} from '../source/ui/UiRoot.js';
import {createTestTheme} from './createTestTheme.js';

// UiRoot registers its pointertap listeners via the federated event system
// (addEventListener), which pixi only installs on Container through this side
// effect.
import 'pixi.js/events';

type MockContainer = {
  alpha: number;
  children: MockContainer[];
  destroyed: boolean;
  eventMode: string;
};

function tick(deltaMS: number): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

let roots: Array<{destroy: () => void}> = [];

function createRoot() {
  let root = new UiRoot({theme: createTestTheme()});

  // Modal sizes itself against the root's layout; the game's screens give their UiRoot one.
  root.view.layout = {width: '100%', height: '100%'};
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
  // Modal imports @pixi/layout, which installs the layout mixin on every pixi Container, so its
  // views build yoga nodes; with no renderer here to init the layout system, the suite loads yoga
  // itself.
  beforeAll(async () => {
    await new LayoutSystem().init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  afterEach(() => {
    for (let root of roots) {
      root.destroy();
    }

    roots = [];
    vitest.restoreAllMocks();
  });

  test('addOverlay adds the modal as the last UI child, below the focus ring', () => {
    let root = createRoot();
    let rootView = root.view as unknown as MockContainer;
    let ringContainer = rootView.children[0];
    let outside = focusable();

    root.addChild(outside);

    let inside = focusable();
    let modal = new Modal({children: [panel([inside])]});

    root.addOverlay(modal);

    expect(root.children.at(-1)).toBe(modal);
    expect(rootView.children.at(-1)).toBe(ringContainer);
    expect(rootView.children.at(-2)).toBe(modal.view as unknown as MockContainer);
    expect(modal.state).toBe('open');
  });

  test('an added modal traps focus inside it', () => {
    let root = createRoot();
    let outside = focusable();

    root.addChild(outside);

    let first = focusable();
    let second = focusable();
    let modal = new Modal({children: [panel([first, second])]});

    root.addOverlay(modal);

    root.focusNext();

    expect(root.focused).toBe(first);

    root.focusNext();

    expect(root.focused).toBe(second);

    root.focusNext();

    expect(root.focused).toBe(first); // wraps within the scope; outside is unreachable
  });

  test('adding applies initialFocus programmatically (no ring)', () => {
    let root = createRoot();
    let resume = focusable();
    let modal = new Modal({children: [panel([resume])], initialFocus: resume});

    root.addOverlay(modal);

    expect(root.focused).toBe(resume);
    expect(root.isRingVisible).toBe(false);
  });

  test('nothing is focused when initialFocus is omitted', () => {
    let root = createRoot();
    let inside = focusable();
    let modal = new Modal({children: [panel([inside])]});

    root.addOverlay(modal);

    expect(root.focused).toBeNull();
  });

  test('adding an attached modal throws', () => {
    let root = createRoot();
    let modal = new Modal({});

    root.addOverlay(modal);

    expect(() => {
      root.addOverlay(modal);
    }).toThrow('Overlay was already added to the UI root!');

    expect(root.children.filter((child) => child === modal)).toHaveLength(1);
    expect(root.topOverlay).toBe(modal);
    expect(modal.state).toBe('open');
  });

  test('adding a closed modal throws, because close() destroyed it', () => {
    let root = createRoot();
    let modal = new Modal({});

    root.addOverlay(modal);
    modal.close();

    expect(() => {
      root.addOverlay(modal);
    }).toThrow('Overlay is destroyed!');

    expect(root.children).not.toContain(modal);
    expect(root.topOverlay).toBeNull();
  });

  test('a modal is attached to one root at a time', () => {
    let first = createRoot();
    let second = createRoot();
    let modal = new Modal({});

    first.addOverlay(modal);

    expect(() => {
      second.addOverlay(modal);
    }).toThrow('Modal is already attached to a UI root!');

    expect(first.topOverlay).toBe(modal);
    expect(modal.state).toBe('open');
  });

  test('detach() throws for a modal that is not attached', () => {
    let modal = new Modal({});

    expect(() => {
      modal.detach();
    }).toThrow('Modal is not attached to a UI root!');
  });

  test('close() removes the modal and restores prior focus', () => {
    let root = createRoot();
    let outside = focusable();

    root.addChild(outside);

    let inside = focusable();
    let modal = new Modal({children: [panel([inside])]});

    root.focus(outside);
    root.addOverlay(modal);

    modal.close();

    expect(root.focused).toBe(outside);
    expect(root.children).not.toContain(modal);
    expect((modal.view as unknown as MockContainer).destroyed).toBe(true);
    expect(modal.state).toBe('closed');
  });

  test('close() fires onClosing then onClosed once, and later calls are no-ops', () => {
    let root = createRoot();
    let calls: string[] = [];
    let modal = new Modal({
      onClosing: () => {
        calls.push('closing');
      },
      onClosed: () => {
        calls.push('closed');
      },
    });

    root.addOverlay(modal);
    modal.close();
    modal.close();

    expect(calls).toEqual(['closing', 'closed']);
  });

  test('destroy() inside onClosing ends the close: closed, and onClosed never fires', () => {
    let root = createRoot();
    let onClosed = vitest.fn<() => void>();
    let modal: Modal = new Modal({
      onClosing: () => {
        modal.destroy();
      },
      onClosed,
    });

    root.addOverlay(modal);
    modal.close();

    expect(modal.state).toBe('closed');
    expect(modal.view.destroyed).toBe(true);
    expect(root.children).not.toContain(modal);
    expect(onClosed).not.toHaveBeenCalled();
  });

  test('ui.removeOverlay(modal) inside onClosing ends the close and keeps the views', () => {
    let root = createRoot();
    let onClosed = vitest.fn<() => void>();
    let modal: Modal = new Modal({
      onClosing: () => {
        root.removeOverlay(modal);
      },
      onClosed,
    });

    root.addOverlay(modal);
    modal.close();

    expect(modal.state).toBe('closed');
    expect(modal.view.destroyed).toBe(false);
    expect(root.children).not.toContain(modal);
    expect(onClosed).not.toHaveBeenCalled();

    modal.destroy();
  });

  test('destroy() tears down synchronously from any state and fires neither close hook', () => {
    let root = createRoot();
    let outside = focusable();

    root.addChild(outside);

    let onClosing = vitest.fn<() => void>();
    let onClosed = vitest.fn<() => void>();
    let modal = new Modal({children: [panel([focusable()])], onClosing, onClosed});

    root.focus(outside);
    root.addOverlay(modal);
    modal.destroy();

    expect(root.children).not.toContain(modal);
    expect((modal.view as unknown as MockContainer).destroyed).toBe(true);
    expect(root.focused).toBe(outside);
    expect(modal.state).toBe('closed');
    expect(onClosing).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();

    expect(() => {
      modal.destroy(); // idempotent
      new Modal({}).destroy(); // destroy before any open
    }).not.toThrow();
  });

  test('destroy() survives a root whose view was destroyed in place', () => {
    let root = createRoot();
    let onClosing = vitest.fn<() => void>();
    let onClosed = vitest.fn<() => void>();
    let modal = new Modal({children: [panel([focusable()])], onClosing, onClosed});

    root.addOverlay(modal);
    // Not through root.destroy(), which would cascade into modal.destroy():
    // the root's view is gone while the modal still points at the root.
    root.view.destroy();

    expect(() => {
      modal.destroy();
    }).not.toThrow();

    expect(modal.view.destroyed).toBe(true);
    expect(root.children).not.toContain(modal);
    expect(modal.state).toBe('closed');
    expect(onClosing).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();
  });

  test('destroy() leaves the root before the views go, so the focusables are deactivated', () => {
    let root = createRoot();
    let inside = {...focusable(), deactivate: vitest.fn<() => void>()};
    let modal = new Modal({children: [panel([inside])]});

    root.addOverlay(modal);
    modal.destroy();

    expect(inside.deactivate).toHaveBeenCalledTimes(1);
    expect(modal.view.destroyed).toBe(true);
  });

  test('the root asks yoga for the whole UiRoot view, out of its flow', () => {
    let modal = new Modal({});

    expect(modal.view.layout?.style).toMatchObject({
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
    });
  });

  test('the layout option passes through verbatim', () => {
    let modal = new Modal({layout: {justifyContent: 'center', alignItems: 'center'}});

    expect(modal.view.layout?.style).toMatchObject({
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
    // The hit area accepts every point, so the scrim blocks before yoga sized
    // it, and wherever the press lands.
    expect(scrim.hitArea?.contains(0, 0)).toBe(true);
    expect(scrim.hitArea?.contains(-5000, 9000)).toBe(true);
    // Drawn once as a unit square; yoga stretches it over the root.
    expect(scrim.bounds).toMatchObject({x: 0, y: 0, width: 1, height: 1});
    expect(scrim.layout?.style).toMatchObject({
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
    });
    expect(viewChildren[1]).toBe(content.view as unknown as MockContainer);
    expect(modal.children).toEqual([content]); // the focus walk never sees the scrim
  });

  test('the scrim takes its color and alpha from the theme, and options override them', () => {
    let theme = {...createTestTheme(), modal: {scrimColor: 0x112233, scrimAlpha: 0.3}};
    let themed = (new Modal({theme}).view as unknown as MockContainer)
      .children[0] as unknown as Graphics;
    let overridden = (
      new Modal({theme, scrimColor: 0x445566, scrimAlpha: 0.7}).view as unknown as MockContainer
    ).children[0] as unknown as Graphics;

    expect(themed.alpha).toBeCloseTo(0.3);
    expect(themed.context.instructions[0]).toMatchObject({data: {style: {color: 0x112233}}});
    expect(overridden.alpha).toBeCloseTo(0.7);
    expect(overridden.context.instructions[0]).toMatchObject({data: {style: {color: 0x445566}}});
  });

  test('ui.removeOverlay(modal) leaves the modal alive and fires neither close hook', () => {
    let root = createRoot();
    let outside = focusable();

    root.addChild(outside);

    let onClosing = vitest.fn<() => void>();
    let onClosed = vitest.fn<() => void>();
    let inside = focusable();
    let modal = new Modal({children: [panel([inside])], onClosing, onClosed});

    root.focus(outside);
    root.addOverlay(modal);
    root.removeOverlay(modal);

    expect(root.children).not.toContain(modal);
    expect(root.topOverlay).toBeNull();
    expect(root.focused).toBe(outside);
    expect((modal.view as unknown as MockContainer).destroyed).toBe(false);
    expect(modal.state).toBe('closed');
    expect(onClosing).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();

    // Removed, not destroyed: the same instance goes back in.
    root.addOverlay(modal);

    expect(modal.state).toBe('open');
    expect(root.topOverlay).toBe(modal);

    modal.destroy();
  });

  test('the cancel command closes the modal', () => {
    let root = createRoot();
    let onClosing = vitest.fn<() => void>();
    let modal = new Modal({children: [panel([focusable()])], onClosing});

    root.addOverlay(modal);
    root.cancel();

    expect(onClosing).toHaveBeenCalledTimes(1);
    expect(modal.state).toBe('closed');
  });

  describe('isReusable', () => {
    test('close() keeps the views, fires onClosed and ends in closed', () => {
      let root = createRoot();
      let outside = focusable();

      root.addChild(outside);

      let calls: string[] = [];
      let content = {...panel([focusable()]), destroy: vitest.fn<() => void>()};
      let modal = new Modal({
        children: [content],
        isReusable: true,
        onClosing: () => {
          calls.push('closing');
        },
        onClosed: () => {
          calls.push(`closed:${modal.state}:${String(root.children.includes(modal))}`);
        },
      });

      root.focus(outside);
      root.addOverlay(modal);
      modal.close();

      // onClosed fires last: the modal has already left the root by then.
      expect(calls).toEqual(['closing', 'closed:closed:false']);
      expect(modal.state).toBe('closed');
      expect(root.children).not.toContain(modal);
      expect(root.topOverlay).toBeNull();
      expect(root.focused).toBe(outside);
      expect((modal.view as unknown as MockContainer).destroyed).toBe(false);
      expect(content.destroy).not.toHaveBeenCalled();
      expect(modal.children).toEqual([content]);

      modal.destroy();
    });

    test('a kept modal can be added again, and every close fires both hooks', () => {
      let root = createRoot();
      let onClosing = vitest.fn<() => void>();
      let onClosed = vitest.fn<() => void>();
      let first = focusable();
      let second = focusable();
      let modal = new Modal({
        children: [panel([first, second])],
        initialFocus: first,
        isReusable: true,
        onClosing,
        onClosed,
      });

      root.addOverlay(modal);
      root.focus(second);
      modal.close();
      root.addOverlay(modal);

      // Keyboard focus is not kept: initialFocus is applied on every attach.
      expect(modal.state).toBe('open');
      expect(root.topOverlay).toBe(modal);
      expect(root.focused).toBe(first);
      expect(root.isRingVisible).toBe(false);

      modal.close();

      expect(onClosing).toHaveBeenCalledTimes(2);
      expect(onClosed).toHaveBeenCalledTimes(2);
      expect((modal.view as unknown as MockContainer).destroyed).toBe(false);

      modal.destroy();
    });

    test('a kept modal fades in again from alpha 0', () => {
      let root = createRoot();
      let scheduler = new Scheduler();
      let modal = new Modal({isReusable: true, scheduler, fadeDuration: 200});
      let view = modal.view as unknown as MockContainer;

      root.addOverlay(modal);
      scheduler.update(tick(200)); // open
      modal.close();
      scheduler.update(tick(200)); // closed, alpha 0

      expect(modal.state).toBe('closed');
      expect(view.alpha).toBe(0);
      expect(view.destroyed).toBe(false);

      root.addOverlay(modal);

      expect(modal.state).toBe('opening');
      expect(view.alpha).toBe(0);

      scheduler.update(tick(100));

      expect(view.alpha).toBeCloseTo(0.75); // easeOutQuad(0.5)

      scheduler.update(tick(100));

      expect(view.alpha).toBe(1);
      expect(modal.state).toBe('open');

      modal.destroy();
    });

    test('adding a kept modal that is still fading out throws', () => {
      let root = createRoot();
      let scheduler = new Scheduler();
      let modal = new Modal({isReusable: true, scheduler, fadeDuration: 200});

      root.addOverlay(modal);
      scheduler.update(tick(200)); // open
      modal.close();

      expect(() => {
        root.addOverlay(modal);
      }).toThrow('Overlay was already added to the UI root!');

      scheduler.update(tick(200)); // closed

      expect(() => {
        root.addOverlay(modal);
      }).not.toThrow();

      modal.destroy();
    });

    test('destroy() destroys a kept modal, attached or not', () => {
      let root = createRoot();
      let onClosing = vitest.fn<() => void>();
      let onClosed = vitest.fn<() => void>();
      let attachedContent = {...panel([]), destroy: vitest.fn<() => void>()};
      let attached = new Modal({
        children: [attachedContent],
        isReusable: true,
        onClosing,
        onClosed,
      });
      let kept = new Modal({isReusable: true, onClosing, onClosed});

      root.addOverlay(attached);
      attached.destroy();

      root.addOverlay(kept);
      kept.close();
      kept.destroy();

      expect(root.children).toEqual([]);
      expect((attached.view as unknown as MockContainer).destroyed).toBe(true);
      expect(attachedContent.destroy).toHaveBeenCalledTimes(1);
      expect((kept.view as unknown as MockContainer).destroyed).toBe(true);
      // Only kept.close() fired hooks; destroy() never does.
      expect(onClosing).toHaveBeenCalledTimes(1);
      expect(onClosed).toHaveBeenCalledTimes(1);
    });

    test('adding a destroyed kept modal throws', () => {
      let root = createRoot();
      let modal = new Modal({isReusable: true});

      root.addOverlay(modal);
      modal.close();
      modal.destroy();

      expect(() => {
        root.addOverlay(modal);
      }).toThrow('Overlay is destroyed!');
    });
  });

  describe('fade (scheduler + fadeDuration)', () => {
    test('adding fades in: opening at alpha 0, open at alpha 1', () => {
      let root = createRoot();
      let scheduler = new Scheduler();
      let inside = focusable();
      let modal = new Modal({children: [panel([inside])], scheduler, fadeDuration: 200});
      let view = modal.view as unknown as MockContainer;

      root.addOverlay(modal);

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
      let onClosing = vitest.fn<() => void>();
      let onClosed = vitest.fn<() => void>();
      let inside = focusable();
      let modal = new Modal({
        children: [panel([inside])],
        scheduler,
        fadeDuration: 200,
        onClosing,
        onClosed,
      });
      let view = modal.view as unknown as MockContainer;

      root.focus(outside);
      root.addOverlay(modal);
      scheduler.update(tick(100)); // mid fade-in, alpha 0.75

      modal.close();

      expect(modal.state).toBe('closing');
      expect(view.alpha).toBeCloseTo(0.75); // no jump at close-start
      // onClosing fires at close-START, behind the fading scrim; onClosed waits.
      expect(onClosing).toHaveBeenCalledTimes(1);
      expect(onClosed).not.toHaveBeenCalled();
      expect(root.children).toContain(modal); // still attached while fading out

      // The scope pops at close-COMPLETE, not close-start: still confined.
      root.focusNext();

      expect(root.focused).toBe(inside);

      scheduler.update(tick(200)); // fade-out completes

      expect(view.alpha).toBe(0);
      expect(modal.state).toBe('closed');
      expect(root.children).not.toContain(modal);
      expect(root.focused).toBe(outside);
      expect(onClosing).toHaveBeenCalledTimes(1);
      expect(onClosed).toHaveBeenCalledTimes(1);
    });

    test('close() while already closing does not double-fire either hook', () => {
      let root = createRoot();
      let scheduler = new Scheduler();
      let onClosing = vitest.fn<() => void>();
      let onClosed = vitest.fn<() => void>();
      let modal = new Modal({scheduler, fadeDuration: 200, onClosing, onClosed});

      root.addOverlay(modal);
      scheduler.update(tick(200)); // open
      modal.close();
      modal.close();
      scheduler.update(tick(200));

      expect(onClosing).toHaveBeenCalledTimes(1);
      expect(onClosed).toHaveBeenCalledTimes(1);
    });

    test('adding a modal that is still fading out throws', () => {
      let root = createRoot();
      let scheduler = new Scheduler();
      let modal = new Modal({scheduler, fadeDuration: 200});

      root.addOverlay(modal);
      scheduler.update(tick(200)); // open
      modal.close();

      expect(modal.state).toBe('closing');

      expect(() => {
        root.addOverlay(modal);
      }).toThrow('Overlay was already added to the UI root!');

      expect(modal.state).toBe('closing');

      scheduler.update(tick(200)); // the fade-out still completes

      expect(modal.state).toBe('closed');
      expect(root.children).not.toContain(modal);
    });

    test('ui.removeOverlay(modal) during a fade cancels the tween', () => {
      let root = createRoot();
      let scheduler = new Scheduler();
      let onClosing = vitest.fn<() => void>();
      let onClosed = vitest.fn<() => void>();
      let modal = new Modal({scheduler, fadeDuration: 200, onClosing, onClosed});
      let view = modal.view as unknown as MockContainer;

      root.addOverlay(modal);
      scheduler.update(tick(200)); // open
      modal.close();
      scheduler.update(tick(100)); // mid fade-out

      root.removeOverlay(modal);

      let alphaAtRemoval = view.alpha;

      expect(modal.state).toBe('closed');
      expect(view.destroyed).toBe(false);

      scheduler.update(tick(1000));

      // onClosing fired at close-start; the cancelled fade never reaches
      // onClosed, and the view is left alone.
      expect(view.alpha).toBe(alphaAtRemoval);
      expect(view.destroyed).toBe(false);
      expect(onClosing).toHaveBeenCalledTimes(1);
      expect(onClosed).not.toHaveBeenCalled();

      modal.destroy();
    });

    test('destroy() inside onClosing starts no fade-out and never fires onClosed', () => {
      let root = createRoot();
      let scheduler = new Scheduler();
      let onClosed = vitest.fn<() => void>();
      let modal: Modal = new Modal({
        scheduler,
        fadeDuration: 200,
        onClosing: () => {
          modal.destroy();
        },
        onClosed,
      });
      let view = modal.view as unknown as MockContainer;

      root.addOverlay(modal);
      scheduler.update(tick(200)); // open
      modal.close();

      expect(modal.state).toBe('closed');
      expect(view.destroyed).toBe(true);

      let alphaAtDestroy = view.alpha;

      expect(() => {
        scheduler.update(tick(1000));
      }).not.toThrow();

      expect(view.alpha).toBe(alphaAtDestroy); // no fade-out ran on the destroyed view
      expect(modal.state).toBe('closed');
      expect(onClosed).not.toHaveBeenCalled();
    });

    test('destroy() mid-fade cancels the tween and fires neither close hook', () => {
      let root = createRoot();
      let scheduler = new Scheduler();
      let onClosing = vitest.fn<() => void>();
      let onClosed = vitest.fn<() => void>();
      let modal = new Modal({scheduler, fadeDuration: 200, onClosing, onClosed});
      let view = modal.view as unknown as MockContainer;

      root.addOverlay(modal);
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
      expect(onClosing).not.toHaveBeenCalled();
      expect(onClosed).not.toHaveBeenCalled();
    });
  });
});

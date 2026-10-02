import {LayoutSystem} from '@pixi/layout';
import {Modal, UiRoot} from 'tellurion';
import {beforeAll, describe, expect, test} from 'vitest';

import {openPauseMenu, teardownWorldScreen} from '../source/game/screens/pauseFlow.js';
import {createTestTheme} from './createTestTheme.js';

// Container.prototype gets addEventListener only once pixi's events system
// registers itself; in the real app that happens as a side effect of
// Application.init() (loading the WebGL renderer), long before any screen's
// UiRoot is built. This file builds a UiRoot + Modal directly, with no
// Application in between, so it needs the same registration explicitly. The
// rest of the suite dodges this entirely by mocking pixi.js.
import 'pixi.js/events';

describe('pauseFlow', () => {
  // Importing tellurion evaluates its Game module, whose `import '@pixi/layout'`
  // installs the layout mixin on every pixi Container, so the real Modal builds
  // yoga nodes; with no renderer here to init the layout system, the suite
  // loads yoga itself (the engine tests' setup).
  beforeAll(async () => {
    await new LayoutSystem().init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  test('openPauseMenu pauses the world before opening the modal', () => {
    let calls: string[] = [];

    openPauseMenu({
      world: {
        pause: () => {
          calls.push('pause');
        },
      },
      openModal: () => {
        calls.push('open');
      },
    });

    expect(calls).toEqual(['pause', 'open']);
  });

  test('teardownWorldScreen destroys the modal, stops the world, then detaches it', () => {
    let calls: string[] = [];

    teardownWorldScreen({
      modal: {
        destroy: () => {
          calls.push('destroy');
        },
      },
      world: {
        stop: () => {
          calls.push('stop');
        },
      },
      detachWorld: () => {
        calls.push('detach');
      },
    });

    expect(calls).toEqual(['destroy', 'stop', 'detach']);
  });

  test('teardownWorldScreen tolerates no open modal', () => {
    let calls: string[] = [];

    teardownWorldScreen({
      modal: null,
      world: {
        stop: () => {
          calls.push('stop');
        },
      },
      detachWorld: () => {
        calls.push('detach');
      },
    });

    expect(calls).toEqual(['stop', 'detach']);
  });

  test('cancel on the pause modal resumes the world once, like the Resume button', () => {
    let calls: string[] = [];
    let root = new UiRoot({theme: createTestTheme()});

    // Modal sizes itself against the root's layout; the game's screens give
    // their UiRoot one (worldScreen: 100% of the screen).
    root.view.layout = {width: '100%', height: '100%'};

    let modal = new Modal({
      children: [],
      onClosing: () => {
        calls.push('resume');
      },
    });

    root.addOverlay(modal);

    // Escape reaches the modal as the topmost overlay; the world must not be
    // left frozen behind a closed overlay. A Resume click racing it is a no-op.
    root.cancel();
    modal.close();

    expect(calls).toEqual(['resume']);
    expect(modal.state).toBe('closed');

    root.destroy();
  });
});

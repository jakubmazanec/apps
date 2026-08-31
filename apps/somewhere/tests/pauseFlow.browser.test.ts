import {describe, expect, test, vitest} from 'vitest';

import {Modal} from '../source/engine/ui/Modal.js';
import {UiRoot} from '../source/engine/ui/UiRoot.js';
import {
  openPauseMenu,
  resumeFromPause,
  teardownWorldScreen,
} from '../source/game/screens/pauseFlow.js';

// Container.prototype gets addEventListener only once pixi's events system
// registers itself; in the real app that happens as a side effect of
// Application.init() (loading the WebGL renderer), long before any screen's
// UiRoot is built. This file builds a UiRoot + Modal directly, with no
// Application in between, so it needs the same registration explicitly. The
// rest of the suite dodges this entirely by mocking pixi.js.
import 'pixi.js/events';

describe('pauseFlow', () => {
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

  test('resumeFromPause closes the modal at close-start, then resumes the world', () => {
    let calls: string[] = [];

    resumeFromPause({
      world: {
        resume: () => {
          calls.push('resume');
        },
      },
      modal: {
        close: () => {
          calls.push('close');

          return true;
        },
      },
    });

    expect(calls).toEqual(['close', 'resume']);
  });

  test('resumeFromPause does not resume when the modal was already closing', () => {
    let resume = vitest.fn<() => void>();

    resumeFromPause({world: {resume}, modal: {close: () => false}});

    expect(resume).not.toHaveBeenCalled();
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

  test('cancel on the pause modal resumes the world, like the Resume button', () => {
    let calls: string[] = [];
    let root = new UiRoot();
    let modal: Modal = new Modal({
      children: [],
      onCancel: () => {
        resumeFromPause({
          world: {
            resume: () => {
              calls.push('resume');
            },
          },
          modal,
        });
      },
    });

    modal.open(root);

    // Escape reaches the modal through the scope it pushed; the world must not
    // be left frozen behind a closed overlay.
    expect(root.cancel()).toBe(true);
    expect(calls).toEqual(['resume']);
    expect(modal.state).toBe('closed');

    root.destroy();
  });
});

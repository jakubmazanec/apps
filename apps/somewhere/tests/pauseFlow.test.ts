import {describe, expect, test, vi} from 'vitest';

import {openPauseMenu, resumeFromPause, teardownGameScreen} from '../source/game/pauseFlow.js';

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
    let resume = vi.fn();

    resumeFromPause({world: {resume}, modal: {close: () => false}});

    expect(resume).not.toHaveBeenCalled();
  });

  test('teardownGameScreen destroys the modal, stops the world, then detaches it', () => {
    let calls: string[] = [];

    teardownGameScreen({
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

  test('teardownGameScreen tolerates no open modal', () => {
    let calls: string[] = [];

    teardownGameScreen({
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
});

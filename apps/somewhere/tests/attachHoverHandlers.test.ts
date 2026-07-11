import {type LayoutContainer} from '@pixi/layout/components';
import {describe, expect, test, vi} from 'vitest';

import {attachHoverHandlers} from '../source/engine/ui/attachHoverHandlers.js';

function fakeView() {
  let handlers: Record<string, () => void> = {};
  let view = {
    on(event: string, callback: () => void) {
      handlers[event] = callback;

      return view;
    },
  };

  return {handlers, view: view as unknown as LayoutContainer};
}

describe('attachHoverHandlers', () => {
  test('pointerover moves the widget to hovered and pointerout back to normal', () => {
    let {handlers, view} = fakeView();
    let state = 'normal';
    let setState = vi.fn((next: string) => {
      state = next;
    });

    attachHoverHandlers(view, () => state, setState);

    handlers.pointerover?.();

    expect(setState).toHaveBeenCalledWith('hovered');

    handlers.pointerout?.();

    expect(setState).toHaveBeenCalledWith('normal');
  });

  test('a disabled widget ignores hover', () => {
    let {handlers, view} = fakeView();
    let setState = vi.fn();

    attachHoverHandlers(view, () => 'disabled', setState);

    handlers.pointerover?.();
    handlers.pointerout?.();

    expect(setState).not.toHaveBeenCalled();
  });

  test('a widget already in the target state is left alone', () => {
    let {handlers, view} = fakeView();
    let setState = vi.fn();

    attachHoverHandlers(view, () => 'hovered', setState);
    handlers.pointerover?.();

    expect(setState).not.toHaveBeenCalled();

    attachHoverHandlers(view, () => 'normal', setState);
    handlers.pointerout?.();

    expect(setState).not.toHaveBeenCalled();
  });
});

import {LayoutSystem} from '@pixi/layout';
import {LayoutContainer} from '@pixi/layout/components';
import {beforeAll, describe, expect, test, vitest} from 'vitest';

import {attachWidgetInteraction} from '../source/engine/ui/attachWidgetInteraction.js';

let layoutSystem: LayoutSystem;

describe(attachWidgetInteraction, () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  test('makes the view interactive with the cursor its widget was built with', () => {
    let view = new LayoutContainer({});

    view.eventMode = 'passive';
    view.cursor = 'auto';

    attachWidgetInteraction(view, {
      cursor: 'text',
      getState: () => 'normal',
      setState: vitest.fn<(state: 'hovered' | 'normal') => void>(),
    });

    expect(view.eventMode).toBe('static');
    expect(view.cursor).toBe('text');
  });

  test('sizes the hit area from the computed layout', () => {
    let view = new LayoutContainer({});

    attachWidgetInteraction(view, {
      cursor: 'pointer',
      getState: () => 'normal',
      setState: vitest.fn<(state: 'hovered' | 'normal') => void>(),
    });

    // @ts-expect-error -- ComputedLayout requires more properties than needed at runtime
    view.emit('layout', {computedLayout: {width: 32, height: 6}});

    expect(view.hitArea).toMatchObject({width: 32, height: 6});
  });

  test('pointerover moves the widget to hovered and pointerout back to normal', () => {
    let view = new LayoutContainer({});
    let state = 'normal';
    let setState = vitest.fn<(next: 'hovered' | 'normal') => void>((next) => {
      state = next;
    });

    attachWidgetInteraction(view, {
      cursor: 'pointer',
      getState: () => state,
      setState,
    });

    // @ts-expect-error -- pixi emits without event data at runtime
    view.emit('pointerover');

    expect(setState).toHaveBeenCalledWith('hovered');

    // @ts-expect-error -- pixi emits without event data at runtime
    view.emit('pointerout');

    expect(setState).toHaveBeenCalledWith('normal');
  });
});

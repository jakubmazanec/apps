import {LayoutSystem} from '@pixi/layout';
import {LayoutContainer} from '@pixi/layout/components';
import * as pixi from 'pixi.js';
import {beforeAll, describe, expect, test, vitest} from 'vitest';

import {attachInteraction} from '../source/ui/internals/attachInteraction.js';

// The pointer moves below go through a real EventBoundary, which needs the
// federated event mixin (isInteractive) on Container.
import 'pixi.js/events';

let layoutSystem: LayoutSystem;

function movePointer(boundary: pixi.EventBoundary, x: number, y: number) {
  let event = new pixi.FederatedPointerEvent(boundary);

  event.type = 'pointermove';
  event.pointerId = 1;
  event.pointerType = 'mouse';
  event.global.set(x, y);
  boundary.mapEvent(event);
}

describe(attachInteraction, () => {
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

    attachInteraction(view, {
      cursor: 'text',
      setState: vitest.fn<(state: 'hovered' | 'normal') => void>(),
    });

    expect(view.eventMode).toBe('static');
    expect(view.cursor).toBe('text');
  });

  test('sizes the hit area from the computed layout', () => {
    let view = new LayoutContainer({});

    attachInteraction(view, {
      cursor: 'pointer',
      setState: vitest.fn<(state: 'hovered' | 'normal') => void>(),
    });

    // @ts-expect-error -- ComputedLayout requires more properties than needed at runtime
    view.emit('layout', {computedLayout: {width: 32, height: 6}});

    expect(view.hitArea).toMatchObject({width: 32, height: 6});
  });

  test('pointerover moves the widget to hovered and pointerout back to normal', () => {
    let view = new LayoutContainer({});
    let setState = vitest.fn<(next: 'hovered' | 'normal') => void>();

    attachInteraction(view, {cursor: 'pointer', setState});

    // @ts-expect-error -- pixi emits without event data at runtime
    view.emit('pointerover');

    expect(setState).toHaveBeenCalledWith('hovered');

    // @ts-expect-error -- pixi emits without event data at runtime
    view.emit('pointerout');

    expect(setState).toHaveBeenCalledWith('normal');
  });

  test('a view disabled while hovered gets no hover transitions', () => {
    let stage = new pixi.Container();
    let view = new LayoutContainer({});
    let boundary = new pixi.EventBoundary(stage);
    let setState = vitest.fn<(next: 'hovered' | 'normal') => void>();

    stage.addChild(view);
    attachInteraction(view, {cursor: 'pointer', setState});

    // @ts-expect-error -- ComputedLayout requires more properties than needed at runtime
    view.emit('layout', {computedLayout: {width: 32, height: 6}});
    movePointer(boundary, 16, 3);

    // What every widget's disable() does to its view.
    view.eventMode = 'none';
    movePointer(boundary, 100, 100);
    movePointer(boundary, 16, 3);

    expect(setState.mock.calls).toEqual([['hovered']]);
  });
});

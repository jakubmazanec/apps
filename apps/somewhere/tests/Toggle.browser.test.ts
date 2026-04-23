/* eslint-disable unicorn/consistent-destructuring -- Toggle.isChecked is a getter, cannot be statically destructured */
import {LayoutSystem} from '@pixi/layout';
import * as pixi from 'pixi.js';
import {beforeAll, beforeEach, describe, expect, test, vitest} from 'vitest';

import {createBackground} from '../source/engine/ui/createBackground.js';
import {Toggle} from '../source/engine/ui/Toggle.js';
import {createTestTheme} from './createTestTheme.js';

let layoutSystem: LayoutSystem;

vitest.mock(import('../source/engine/ui/createBackground.js'), () => ({
  createBackground: vitest.fn<typeof createBackground>(() => background()),
}));

function background(): pixi.Container {
  let container = new pixi.Container();

  return container;
}

describe(Toggle, () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  test('sizes its hit area from the computed layout', () => {
    let toggle = new Toggle({backgrounds: {unchecked: background(), checked: background()}});
    let {view} = toggle;

    // @ts-expect-error -- ComputedLayout requires more properties than needed at runtime
    view.emit('layout', {computedLayout: {width: 32, height: 32}});

    expect(view.hitArea).toMatchObject({width: 32, height: 32});
  });

  test('background swap keeps the layout internals attached', () => {
    let toggle = new Toggle({backgrounds: {unchecked: background(), checked: background()}});
    let {view} = toggle;
    let internals = view.children.filter(
      (child: unknown) => (child as {isOverflowContainer?: boolean}).isOverflowContainer,
    );

    toggle.activate();

    for (let internal of internals) {
      expect(view.children).toContain(internal);
    }
  });
});

describe('Toggle focus', () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  test('is focusable unless disabled', () => {
    let toggle = new Toggle({backgrounds: {unchecked: background(), checked: background()}});

    expect(toggle.isFocusable).toBe(true);
    expect(toggle.isDisabled).toBe(false);

    toggle.disable();

    expect(toggle.isFocusable).toBe(false);
    expect(toggle.isDisabled).toBe(true);
  });

  test('activate flips the value and fires onChange', () => {
    let onChange = vitest.fn<(toggle: Toggle) => void>();
    let toggle = new Toggle({
      backgrounds: {unchecked: background(), checked: background()},
      onChange,
    });

    toggle.activate();

    expect(toggle.isChecked).toBe(true);
    expect(onChange).toHaveBeenCalledWith(toggle);

    toggle.activate();

    expect(toggle.isChecked).toBe(false);
  });

  test('check and uncheck set the value without firing onChange', () => {
    let onChange = vitest.fn<(toggle: Toggle) => void>();
    let toggle = new Toggle({
      backgrounds: {unchecked: background(), checked: background()},
      onChange,
    });

    toggle.check();

    expect(toggle.isChecked).toBe(true);

    toggle.uncheck();

    expect(toggle.isChecked).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('activate is a no-op while disabled', () => {
    let onChange = vitest.fn<(toggle: Toggle) => void>();
    let toggle = new Toggle({
      backgrounds: {unchecked: background(), checked: background()},
      onChange,
    });

    toggle.disable();
    toggle.activate();

    expect(toggle.isChecked).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Toggle disabled interaction', () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  test('disable stops pointer events and enable restores them', () => {
    let toggle = new Toggle({backgrounds: {unchecked: background(), checked: background()}});
    let {view} = toggle;

    expect(view.eventMode).toBe('static');
    expect(view.cursor).toBe('pointer');

    toggle.disable();

    expect(view.eventMode).toBe('none');
    expect(view.cursor).toBe('default');

    toggle.enable();

    expect(view.eventMode).toBe('static');
    expect(view.cursor).toBe('pointer');
  });

  test('a tap on a disabled toggle is ignored, not swallowed', () => {
    let onChange = vitest.fn<(toggle: Toggle) => void>();
    let toggle = new Toggle({
      backgrounds: {unchecked: background(), checked: background()},
      onChange,
    });
    let {view} = toggle;
    let event = {stopPropagation: vitest.fn<() => void>()};

    toggle.disable();
    // @ts-expect-error -- partial FederatedPointerEvent mock
    view.emit('pointertap', event);

    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(toggle.isChecked).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('a tap on an enabled toggle is handled and consumed', () => {
    let onChange = vitest.fn<(toggle: Toggle) => void>();
    let toggle = new Toggle({
      backgrounds: {unchecked: background(), checked: background()},
      onChange,
    });
    let {view} = toggle;
    let event = {stopPropagation: vitest.fn<() => void>()};

    // @ts-expect-error -- partial FederatedPointerEvent mock
    view.emit('pointertap', event);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(toggle.isChecked).toBe(true);
    expect(onChange).toHaveBeenCalledWith(toggle);
  });
});

describe('Toggle theme', () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  beforeEach(() => {
    vitest.mocked(createBackground).mockClear();
  });

  test('takes its backgrounds from the theme', () => {
    let theme = createTestTheme();
    let toggle = new Toggle({theme});

    expect(createBackground).toHaveBeenCalledWith(theme.toggle.unchecked);
    expect(createBackground).toHaveBeenCalledWith(theme.toggle.checked);
    expect(toggle.view.background).toBeDefined();
  });

  test('an explicit background wins over the theme', () => {
    let theme = createTestTheme();
    let unchecked = background();
    let toggle = new Toggle({theme, backgrounds: {unchecked}});

    expect(toggle.view.background).toBe(unchecked);
    expect(createBackground).not.toHaveBeenCalledWith(theme.toggle.unchecked);
  });
});

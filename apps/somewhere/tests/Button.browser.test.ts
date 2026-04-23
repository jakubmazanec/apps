import {LayoutSystem} from '@pixi/layout';
import * as pixi from 'pixi.js';
import {beforeAll, beforeEach, describe, expect, test, vitest} from 'vitest';

import {Button} from '../source/engine/ui/Button.js';
import {createBackground} from '../source/engine/ui/createBackground.js';
import {createTestTheme} from './createTestTheme.js';

let layoutSystem: LayoutSystem;

vitest.mock(import('../source/engine/ui/createBackground.js'), () => ({
  createBackground: vitest.fn<() => pixi.Container>(() => background()),
}));

function background(): pixi.Container {
  let container = new pixi.Container();

  return container;
}

describe('Button layout defaults', () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  test('centers its content by default', () => {
    let button = new Button({backgrounds: {normal: background()}});

    expect(button.view.layout?.style).toMatchObject({
      justifyContent: 'center',
      alignItems: 'center',
    });
  });

  test('caller layout overrides the centering defaults', () => {
    let button = new Button({
      backgrounds: {normal: background()},
      layout: {alignItems: 'flex-end'},
    });

    expect(button.view.layout?.style).toMatchObject({
      justifyContent: 'center',
      alignItems: 'flex-end',
    });
  });

  test('sizes its hit area from the computed layout', () => {
    let button = new Button({backgrounds: {normal: background()}});
    let {view} = button;

    // @ts-expect-error -- ComputedLayout requires more properties than needed at runtime
    view.emit('layout', {computedLayout: {width: 208, height: 64}});

    expect(view.hitArea).toMatchObject({width: 208, height: 64});
  });
});

describe('Button press offset', () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  test('shifts content down on press and restores it on release', () => {
    let button = new Button({
      backgrounds: {normal: background(), hovered: background(), active: background()},
      pressOffset: 4,
      layout: {padding: 8, alignItems: 'center', justifyContent: 'center'},
    });
    let {view} = button;

    // @ts-expect-error -- partial FederatedPointerEvent mock
    view.emit('pointerdown', {global: {x: 0, y: 0}});

    expect(view.layout!.style.paddingTop).toBe(12);
    expect(view.layout!.style.paddingBottom).toBe(4);

    // @ts-expect-error -- pixi emits without data at runtime
    view.emit('pointerup');

    expect(view.layout!.style.paddingTop).toBe(8);
    expect(view.layout!.style.paddingBottom).toBe(8);
  });

  test('pressOffset press and release keep explicit paddingTop/paddingBottom', () => {
    let button = new Button({
      backgrounds: {normal: background(), hovered: background(), active: background()},
      pressOffset: 4,
      layout: {paddingTop: 8, paddingBottom: 8, alignItems: 'center', justifyContent: 'center'},
    });
    let {view} = button;

    // @ts-expect-error -- partial FederatedPointerEvent mock
    view.emit('pointerdown', {global: {x: 0, y: 0}});

    expect(view.layout!.style.paddingTop).toBe(12);
    expect(view.layout!.style.paddingBottom).toBe(4);

    // @ts-expect-error -- pixi emits without data at runtime
    view.emit('pointerup');

    expect(view.layout!.style.paddingTop).toBe(8);
    expect(view.layout!.style.paddingBottom).toBe(8);
  });
});

describe('Button focus', () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  test('keeps added children in a public children array', () => {
    let label: {view: pixi.Container} = {view: new pixi.Container()};
    let button = new Button({backgrounds: {normal: background()}, children: [label]});

    expect(button.children).toEqual([label]);

    button.removeChild(label);

    expect(button.children).toEqual([]);
  });

  test('destroy() cascades to child components', () => {
    let child = {view: new pixi.Container(), destroy: vitest.fn<() => void>()};
    let button = new Button({backgrounds: {normal: background()}, children: [child]});

    button.destroy();

    expect(child.destroy).toHaveBeenCalledTimes(1);
  });

  test('is focusable unless disabled', () => {
    let button = new Button({backgrounds: {normal: background(), disabled: background()}});

    expect(button.isFocusable).toBe(true);
    expect(button.isDisabled).toBe(false);

    button.disable();

    expect(button.isFocusable).toBe(false);
    expect(button.isDisabled).toBe(true);

    button.enable();

    expect(button.isFocusable).toBe(true);
    expect(button.isDisabled).toBe(false);
  });

  test('activate fires onClick', () => {
    let onClick = vitest.fn<(button: Button) => void>();
    let button = new Button({backgrounds: {normal: background()}, onClick});

    button.activate();

    expect(onClick).toHaveBeenCalledWith(button);
  });

  test('activate is a no-op while disabled', () => {
    let onClick = vitest.fn<(button: Button) => void>();
    let button = new Button({backgrounds: {normal: background(), disabled: background()}, onClick});

    button.disable();
    button.activate();

    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Button theme', () => {
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
    let button = new Button({theme});

    expect(createBackground).toHaveBeenCalledWith(theme.button.normal);
    expect(button.view.background).toBeDefined();
  });

  test('an explicit background wins over the theme', () => {
    let theme = createTestTheme();
    let normal = background();
    let button = new Button({theme, backgrounds: {normal}});

    expect(button.view.background).toBe(normal);
    expect(createBackground).not.toHaveBeenCalledWith(theme.button.normal);
  });

  test('takes layout defaults from the theme', () => {
    let theme = createTestTheme();

    theme.button.layout = {padding: 4};

    let button = new Button({theme});

    expect(button.view.layout?.style).toMatchObject({padding: 4});
  });

  test('caller layout wins over theme layout per property', () => {
    let theme = createTestTheme();

    theme.button.layout = {padding: 4, alignItems: 'flex-end'};

    let button = new Button({theme, layout: {padding: 2}});

    expect(button.view.layout?.style).toMatchObject({padding: 2, alignItems: 'flex-end'});
  });

  test('takes pressOffset from the theme', () => {
    let theme = createTestTheme();

    theme.button.layout = {padding: 8};
    theme.button.pressOffset = 3;

    let {view} = new Button({theme});

    // @ts-expect-error -- partial FederatedPointerEvent mock
    view.emit('pointerdown', {global: {x: 0, y: 0}});

    expect(view.layout!.style.paddingTop).toBe(11);
    expect(view.layout!.style.paddingBottom).toBe(5);
  });

  test('caller pressOffset of 0 wins over the theme', () => {
    let theme = createTestTheme();

    theme.button.pressOffset = 3;

    let {view} = new Button({theme, pressOffset: 0, layout: {padding: 8}});

    // @ts-expect-error -- partial FederatedPointerEvent mock
    view.emit('pointerdown', {global: {x: 0, y: 0}});

    expect(view.layout!.style.paddingTop).toBeUndefined();
    expect(view.layout!.style.paddingBottom).toBeUndefined();
  });
});

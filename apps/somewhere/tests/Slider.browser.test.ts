/* eslint-disable unicorn/consistent-destructuring -- Slider.value is a getter, cannot be statically destructured */
import {LayoutSystem} from '@pixi/layout';
import * as pixi from 'pixi.js';
import {beforeAll, beforeEach, describe, expect, test, vitest} from 'vitest';

import {createBackground} from '../source/engine/ui/createBackground.js';
import {Slider} from '../source/engine/ui/Slider.js';
import {createTestTheme} from './createTestTheme.js';

let layoutSystem: LayoutSystem;

vitest.mock(import('../source/engine/ui/createBackground.js'), () => ({
  createBackground: vitest.fn<typeof createBackground>(() => background()),
}));

function background(width = 10, height = 10): pixi.Container {
  let sprite = new pixi.Sprite(pixi.Texture.WHITE);

  sprite.width = width;
  sprite.height = height;

  return sprite;
}

function backgrounds(trackWidth = 32, trackHeight = 6) {
  return {track: background(trackWidth, trackHeight), fill: background(0, trackHeight)};
}

function pointerEvent(x: number, buttons = 1, button = 0): pixi.FederatedPointerEvent {
  return {
    stopPropagation: vitest.fn<() => void>(),
    getLocalPosition: () => ({x, y: 0}),
    buttons,
    button,
    global: {x: 0, y: 0},
  } as unknown as pixi.FederatedPointerEvent;
}

function committedFillWidth(slider: InstanceType<typeof Slider>): number {
  let fill = slider.view.overflowContainer.children[0] as unknown as pixi.Container;

  return fill.width;
}

describe('Slider value', () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  test('defaults to min/max 0/1, seeding the fill from the initial value', () => {
    let slider = new Slider({backgrounds: backgrounds()});

    expect(slider.value).toBe(0);
    expect(committedFillWidth(slider)).toBe(0);
  });

  test('clamps an out-of-range initial value to [min, max]', () => {
    let slider = new Slider({backgrounds: backgrounds(), value: 5});

    expect(slider.value).toBe(1);
    expect(committedFillWidth(slider)).toBe(32);
  });

  test('snaps the initial value to the nearest step', () => {
    let slider = new Slider({backgrounds: backgrounds(), value: 0.42});

    expect(slider.value).toBeCloseTo(0.4);
  });
});

describe('Slider pointer interaction', () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  test('pointerdown sets the value from the pointer position and fires onChange', () => {
    let onChange = vitest.fn<(slider: Slider) => void>();
    let slider = new Slider({backgrounds: backgrounds(32, 6), onChange});
    let {view} = slider;

    view.emit('pointerdown', pointerEvent(16));

    expect(slider.value).toBeCloseTo(0.5);
    expect(onChange).toHaveBeenCalledWith(slider);
  });

  test('globalpointermove updates the value only while dragging', () => {
    let onChange = vitest.fn<(slider: Slider) => void>();
    let slider = new Slider({backgrounds: backgrounds(32, 6), onChange});
    let {view} = slider;

    view.emit('globalpointermove', pointerEvent(24));

    expect(slider.value).toBe(0);
    expect(onChange).not.toHaveBeenCalled();

    view.emit('pointerdown', pointerEvent(0));
    onChange.mockClear();
    view.emit('globalpointermove', pointerEvent(24));

    expect(slider.value).toBeCloseTo(0.8);
    expect(onChange).toHaveBeenCalledWith(slider);
  });

  test('a drag past either end of the track pins to max and min', () => {
    let slider = new Slider({backgrounds: backgrounds(32, 6), value: 0.5});
    let {view} = slider;

    view.emit('pointerdown', pointerEvent(16));
    view.emit('globalpointermove', pointerEvent(80));

    expect(slider.value).toBe(1);
    expect(committedFillWidth(slider)).toBe(32);

    view.emit('globalpointermove', pointerEvent(-20));

    expect(slider.value).toBe(0);
    expect(committedFillWidth(slider)).toBe(0);
  });

  test('a secondary-button pointerdown neither sets the value nor latches a drag', () => {
    let onChange = vitest.fn<(slider: Slider) => void>();
    let slider = new Slider({backgrounds: backgrounds(32, 6), onChange});
    let {view} = slider;

    view.emit('pointerdown', pointerEvent(16, 2, 2));

    expect(slider.value).toBe(0);
    expect(onChange).not.toHaveBeenCalled();

    view.emit('globalpointermove', pointerEvent(24, 2, 2));

    expect(slider.value).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('pointerup ends the drag, stopping further movement from changing the value', () => {
    let onChange = vitest.fn<(slider: Slider) => void>();
    let slider = new Slider({backgrounds: backgrounds(32, 6), onChange});
    let {view} = slider;

    view.emit('pointerdown', pointerEvent(16));
    // @ts-expect-error -- pixi emits pointerup without event data at runtime
    view.emit('pointerup');

    onChange.mockClear();
    view.emit('globalpointermove', pointerEvent(0));

    expect(onChange).not.toHaveBeenCalled();
    expect(slider.value).toBeCloseTo(0.5);
  });

  test('pointerupoutside also ends the drag, stopping further movement from changing the value', () => {
    let onChange = vitest.fn<(slider: Slider) => void>();
    let slider = new Slider({backgrounds: backgrounds(32, 6), onChange});
    let {view} = slider;

    view.emit('pointerdown', pointerEvent(16));
    // @ts-expect-error -- pixi emits pointerupoutside without event data at runtime
    view.emit('pointerupoutside');

    onChange.mockClear();
    view.emit('globalpointermove', pointerEvent(0));

    expect(onChange).not.toHaveBeenCalled();
    expect(slider.value).toBeCloseTo(0.5);
  });

  test('pointercancel also ends the drag, stopping further movement from changing the value', () => {
    let onChange = vitest.fn<(slider: Slider) => void>();
    let slider = new Slider({backgrounds: backgrounds(32, 6), onChange});
    let {view} = slider;

    view.emit('pointerdown', pointerEvent(16));
    // @ts-expect-error -- pixi emits pointercancel without event data at runtime
    view.emit('pointercancel');

    onChange.mockClear();
    view.emit('globalpointermove', pointerEvent(0));

    expect(onChange).not.toHaveBeenCalled();
    expect(slider.value).toBeCloseTo(0.5);
  });

  test('a globalpointermove with no button held ends an untracked drag and stops it from resuming', () => {
    let onChange = vitest.fn<(slider: Slider) => void>();
    let slider = new Slider({backgrounds: backgrounds(32, 6), onChange});
    let {view} = slider;

    view.emit('pointerdown', pointerEvent(16));
    onChange.mockClear();

    view.emit('globalpointermove', pointerEvent(0, 0));

    expect(onChange).not.toHaveBeenCalled();
    expect(slider.value).toBeCloseTo(0.5);

    view.emit('globalpointermove', pointerEvent(31));

    expect(slider.value).toBeCloseTo(0.5);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('a pointerdown while disabled is ignored', () => {
    let onChange = vitest.fn<(slider: Slider) => void>();
    let slider = new Slider({
      backgrounds: {...backgrounds(32, 6), disabled: background(32, 6)},
      onChange,
    });
    let {view} = slider;

    slider.disable();
    view.emit('pointerdown', pointerEvent(16));

    expect(slider.value).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Slider keyboard interaction', () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  test('increase steps up by `step`, clamped to max, firing onChange', () => {
    let onChange = vitest.fn<(slider: Slider) => void>();
    let slider = new Slider({backgrounds: backgrounds(), value: 0.95, onChange});

    slider.increase();

    expect(slider.value).toBeCloseTo(1);
    expect(onChange).toHaveBeenCalledWith(slider);
  });

  test('decrease steps down by `step`, clamped to min', () => {
    let slider = new Slider({backgrounds: backgrounds(), value: 0.05});

    slider.decrease();

    expect(slider.value).toBeCloseTo(0);
  });

  test('repeated increase from the min reaches exactly the max, not floating-point drift', () => {
    let slider = new Slider({backgrounds: backgrounds(), value: 0});

    for (let i = 0; i < 10; i++) {
      slider.increase();
    }

    expect(slider.value).toBe(1);
  });

  test('repeated decrease from the max reaches exactly the min, not floating-point drift', () => {
    let slider = new Slider({backgrounds: backgrounds(), value: 1});

    for (let i = 0; i < 10; i++) {
      slider.decrease();
    }

    expect(slider.value).toBe(0);
  });

  test('increase and decrease are no-ops while disabled', () => {
    let onChange = vitest.fn<(slider: Slider) => void>();
    let slider = new Slider({
      backgrounds: {...backgrounds(), disabled: background(32, 6)},
      value: 0.5,
      onChange,
    });

    slider.disable();
    slider.increase();
    slider.decrease();

    expect(slider.value).toBeCloseTo(0.5);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('activate() is a no-op', () => {
    let onChange = vitest.fn<(slider: Slider) => void>();
    let slider = new Slider({backgrounds: backgrounds(), value: 0.5, onChange});

    slider.activate();

    expect(slider.value).toBeCloseTo(0.5);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Slider focus and disabled state', () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  test('is focusable unless disabled', () => {
    let slider = new Slider({backgrounds: {...backgrounds(), disabled: background(32, 6)}});

    expect(slider.isFocusable).toBe(true);

    slider.disable();

    expect(slider.isFocusable).toBe(false);
    expect(slider.isDisabled).toBe(true);

    slider.enable();

    expect(slider.isFocusable).toBe(true);
  });

  test('disable stops pointer events and enable restores them', () => {
    let slider = new Slider({backgrounds: backgrounds()});
    let {view} = slider;

    expect(view.eventMode).toBe('static');
    expect(view.cursor).toBe('pointer');

    slider.disable();

    expect(view.eventMode).toBe('none');
    expect(view.cursor).toBe('default');

    slider.enable();

    expect(view.eventMode).toBe('static');
    expect(view.cursor).toBe('pointer');
  });
});

describe('Slider theme', () => {
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
    let slider = new Slider({theme});

    expect(createBackground).toHaveBeenCalledWith(theme.slider.track);
    expect(createBackground).toHaveBeenCalledWith(theme.slider.fill);
    expect(slider.view.background).toBeDefined();
  });
});

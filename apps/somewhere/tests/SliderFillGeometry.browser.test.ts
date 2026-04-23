// Slider is the first widget in the kit whose geometry *is* its behaviour, and
// the LayoutContainer fake in Slider.test.ts cannot see geometry: its addChild
// is a bare push, modelling neither the overflowContainer indirection nor a
// yoga leaf, so it reads back whatever value the widget handed to setSize. That
// is the right trade for the state-swap widgets (Toggle, Button), but it cannot
// tell a fill that renders at 32 art px from one that renders at 256.
//
// So this file — and only this file — runs the real LayoutContainer against the
// real LayoutSystem and yoga, and asserts on rendered bounds. It deliberately
// declares no vi.mock: everything it imports is the production module. Scope is
// fill geometry only; every other Slider behaviour stays in Slider.test.ts.
//
// `throttle: 0` makes LayoutSystem.update run _updateSize synchronously (its
// default 100 ms throttle would otherwise defer through requestAnimationFrame),
// so a single update() call is enough and the test needs no frame pumping.
// Importing the package entry is also what installs @pixi/layout's Container /
// ViewContainer mixins onto pixi (the same side effect Game.ts relies on), so
// the sprites below get the real layout-aware transform composition.
import {LayoutSystem} from '@pixi/layout';
import * as pixi from 'pixi.js';
import {afterEach, beforeAll, describe, expect, test} from 'vitest';

import {Slider} from '../source/engine/ui/Slider.js';

const TRACK_WIDTH = 32;
const TRACK_HEIGHT = 6;
// The real `slider-fill` atlas frame is 4x4 and gets stretched to the fill
// size. That mismatch between the texture's own size and its rendered size is
// exactly what the double-application bug fed on, so keep it.
const FILL_TEXTURE_SIZE = 4;
let layoutSystem: LayoutSystem;
// Every Slider built by render() lands here so afterEach can destroy it —
// LayoutContainer registers itself on Ticker.shared, so an undestroyed one
// leaks across tests.
const sliders: Array<InstanceType<typeof Slider>> = [];

function sprite(width: number, height: number): pixi.Sprite {
  return new pixi.Sprite(new pixi.Texture({source: new pixi.TextureSource({width, height})}));
}

// Builds a laid-out Slider and reports what actually gets drawn: the fill's
// world bounds, plus the view's own, which is what UiRoot measures to size the
// focus ring.
function render(value: number) {
  let fill = sprite(FILL_TEXTURE_SIZE, FILL_TEXTURE_SIZE);
  let slider = new Slider({
    backgrounds: {track: sprite(TRACK_WIDTH, TRACK_HEIGHT), fill},
    value,
  });

  sliders.push(slider);
  layoutSystem.update(slider.view);

  let fillBounds = fill.getBounds();
  let viewBounds = slider.view.getBounds();

  return {
    value: slider.value,
    fill: {x: fillBounds.x, y: fillBounds.y, width: fillBounds.width, height: fillBounds.height},
    view: {width: viewBounds.width, height: viewBounds.height},
  };
}

describe('Slider fill geometry under the real layout system', () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    // init() is what loads yoga (asynchronously) and builds the throttle, so
    // nothing may call update() before it resolves.
    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  afterEach(() => {
    for (let slider of sliders) {
      slider.destroy();
    }

    sliders.length = 0;
  });

  test.each([
    {value: 1, width: 32},
    {value: 0.5, width: 16},
    {value: 0.1, width: 3.2},
    {value: 0, width: 0},
  ])('renders the fill $width art px wide at value $value', ({value, width}) => {
    let rendered = render(value);

    expect(rendered.value).toBeCloseTo(value, 10);
    expect(rendered.fill.width).toBeCloseTo(width, 10);
    // Full track height at every value, and never scaled by the ratio.
    expect(rendered.fill.height).toBeCloseTo(TRACK_HEIGHT, 10);
  });

  test('anchors the fill to the track origin', () => {
    let rendered = render(0.5);

    expect(rendered.fill.x).toBe(0);
    expect(rendered.fill.y).toBe(0);
  });

  // The fill is unclipped (Slider sets no `overflow`, and LayoutContainer
  // defaults to 'visible'), so an oversized fill both spills across the panel
  // and inflates the view's bounds — which is what UiRoot.update() measures to
  // size the focus ring around a focused widget.
  test('leaves the view no larger than the track at full value', () => {
    let rendered = render(1);

    expect(rendered.view.width).toBeCloseTo(TRACK_WIDTH, 10);
    expect(rendered.view.height).toBeCloseTo(TRACK_HEIGHT, 10);
  });
});

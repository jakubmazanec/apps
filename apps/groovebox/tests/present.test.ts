import {describe, expect, test} from 'vitest';

import {
  CONTROLS,
  DISPLAY,
  MM_PER_PIXEL,
  PANEL_PIXELS,
  type Rectangle,
  toScreenPixels,
} from '../source/shell/panelLayout.js';
import {type Arrangement, expandFrame, fitPanel, realSizePanel} from '../source/shell/present.js';
import {STEP_BUTTONS} from '../source/shell/protocol.js';

// The windows of the brief, in CSS px at their display scale, with the zoom and the placement the
// report found for them and the least size of a played control: an iPhone upright and sideways in
// Safari, a Pixel 7 in Chrome, a laptop window, the owner's laptop at 125% and a full HD monitor
const WINDOWS = [
  {window: {width: 390, height: 660}, ratio: 3, zoom: 2, beside: false, least: 44},
  {window: {width: 750, height: 340}, ratio: 3, zoom: 2, beside: true, least: 40},
  {window: {width: 412, height: 780}, ratio: 2.6, zoom: 2, beside: false, least: 44},
  {window: {width: 1440, height: 800}, ratio: 1, zoom: 2, beside: true, least: 44},
  {window: {width: 1536, height: 830}, ratio: 1.25, zoom: 2, beside: true, least: 44},
  {window: {width: 1920, height: 960}, ratio: 1, zoom: 3, beside: true, least: 44},
];

// The rows of the browser view from top to bottom, each from left to right: three rows of keys with
// a free cell before VOL, two rows of steps and two rows of pads
const ROWS = [
  ['t1', 't2', 't3', 't4', 'pads-keys', 'roll', 'volume'],
  ['rec', 'play', 'stop', 'tempo', 'minus', 'up', 'plus', 'ok'],
  ['menu', 'page', 'copy', 'shift', 'left', 'down', 'right', 'cancel'],
  STEP_BUTTONS.slice(0, 8),
  STEP_BUTTONS.slice(8),
  Array.from({length: 6}, (_, pad) => `pad-${pad}`),
  Array.from({length: 6}, (_, pad) => `pad-${pad + 6}`),
];

// Floating-point slack for edges that should meet
const SLACK = 1e-9;

function at({controls}: Arrangement, name: string) {
  return controls.find(({control}) => control === name) as Rectangle;
}

function centre({x, y, width, height}: Rectangle) {
  return {x: x + width / 2, y: y + height / 2};
}

function overlap(a: Rectangle, b: Rectangle) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe(fitPanel, () => {
  test.each(WINDOWS)(
    'every control appears once with its shape and label ($window.width × $window.height at $ratio)',
    ({window, ratio}) => {
      let {controls} = fitPanel(window, ratio);

      expect(controls).toHaveLength(CONTROLS.length);

      for (let {control, shape, label} of CONTROLS) {
        expect(controls.filter((candidate) => candidate.control === control)).toEqual([
          expect.objectContaining({shape, label}),
        ]);
      }
    },
  );

  test.each(WINDOWS)(
    'the screen takes zoom $zoom, sharp at whole device pixels ($window.width × $window.height at $ratio)',
    ({window, ratio, zoom}) => {
      let layout = fitPanel(window, ratio);

      expect(layout.zoom).toBe(zoom);
      expect(layout.screen.width * ratio).toBeCloseTo(480 * zoom);
      expect(layout.screen.height * ratio).toBeCloseTo(272 * zoom);
      expect(layout.screen.x * ratio).toBeCloseTo(Math.round(layout.screen.x * ratio));
      expect(layout.screen.y * ratio).toBeCloseTo(Math.round(layout.screen.y * ratio));
      expect(layout.exact).toBe(Number.isInteger(ratio));
    },
  );

  test.each(WINDOWS)(
    'every played control is at least $least px ($window.width × $window.height at $ratio)',
    ({window, ratio, least}) => {
      for (let {width, height} of fitPanel(window, ratio).controls) {
        expect(Math.min(width, height)).toBeGreaterThanOrEqual(least);
      }
    },
  );

  test.each(WINDOWS)(
    'the rows go beside the screen: $beside ($window.width × $window.height at $ratio)',
    ({window, ratio, beside}) => {
      let layout = fitPanel(window, ratio);
      let {screen, row} = layout;
      let knob = at(layout, 'encoder-1');
      let firstKey = at(layout, 't1');

      expect(firstKey.x > screen.x + screen.width).toBe(beside);
      expect(firstKey.y > knob.y + knob.height).toBe(!beside);
      // The row with the status line and the buttons is the last block under the screen's knobs
      expect(row.y).toBeGreaterThan(knob.y + knob.height);
    },
  );

  test.each(WINDOWS)(
    'keys, steps and pads keep their rows and order, with OK above CANCEL ($window.width × $window.height at $ratio)',
    ({window, ratio}) => {
      let layout = fitPanel(window, ratio);
      let rows = ROWS.map((names) => names.map((name) => at(layout, name)));

      for (let row of rows) {
        let [first = {x: 0, y: 0, width: 0, height: 0}] = row;

        for (let [index, rectangle] of row.slice(1).entries()) {
          expect(centre(rectangle).y).toBeCloseTo(centre(first).y);
          expect(rectangle.x).toBeGreaterThan(row[index]?.x ?? 0);
        }
      }

      for (let [index, row] of rows.slice(1).entries()) {
        for (let rectangle of row) {
          expect(rectangle.y).toBeGreaterThanOrEqual(
            Math.max(...(rows[index] ?? []).map(({y, height}) => y + height)),
          );
        }
      }

      // The free cell between ROLL and VOL
      expect(centre(at(layout, 'volume')).x - centre(at(layout, 'roll')).x).toBeCloseTo(
        2 * (centre(at(layout, 't2')).x - centre(at(layout, 't1')).x),
      );
      expect(centre(at(layout, 'ok')).x).toBeCloseTo(centre(at(layout, 'cancel')).x);
    },
  );

  test.each(WINDOWS)(
    'each knob sits under its strip cell ($window.width × $window.height at $ratio)',
    ({window, ratio}) => {
      let layout = fitPanel(window, ratio);
      let {screen} = layout;

      for (let index of [0, 1, 2, 3]) {
        let knob = at(layout, `encoder-${index + 1}`);

        expect(centre(knob).x).toBeCloseTo(screen.x + ((index + 0.5) * screen.width) / 4);
        expect(knob.y).toBeGreaterThan(screen.y + screen.height);
      }
    },
  );

  test.each(WINDOWS)(
    'nothing overlaps and everything lies inside the window ($window.width × $window.height at $ratio)',
    ({window, ratio}) => {
      let layout = fitPanel(window, ratio);
      let parts = [layout.screen, layout.row, ...layout.controls];

      expect([layout.width, layout.height]).toEqual([window.width, window.height]);

      for (let [index, part] of parts.entries()) {
        expect(part.x).toBeGreaterThanOrEqual(0);
        expect(part.y).toBeGreaterThanOrEqual(0);
        expect(part.x + part.width).toBeLessThanOrEqual(window.width + SLACK);
        expect(part.y + part.height).toBeLessThanOrEqual(window.height + SLACK);

        for (let other of parts.slice(index + 1)) {
          expect(overlap(part, other)).toBe(false);
        }
      }
    },
  );

  test('on a tie of zooms the larger keys win', () => {
    // At zoom 1 the keys under the screen are about 77 px tall and those beside it 59 px
    let layout = fitPanel({width: 1000, height: 1000}, 1);

    expect(layout.zoom).toBe(1);
    expect(at(layout, 't1').y).toBeGreaterThan(layout.screen.y + layout.screen.height);
    expect(at(layout, 't1').height).toBeGreaterThan(70);
  });

  test('a window too small for the screen at zoom 1 with 40 px keys scrolls', () => {
    let layout = fitPanel({width: 300, height: 300}, 1);
    let parts = [layout.screen, ...layout.controls];

    expect(layout.zoom).toBe(1);
    expect(layout.width).toBeGreaterThan(300);
    expect(layout.height).toBeGreaterThan(300);

    for (let [index, part] of parts.entries()) {
      expect(part.x + part.width).toBeLessThanOrEqual(layout.width + SLACK);
      expect(part.y + part.height).toBeLessThanOrEqual(layout.height + SLACK);

      for (let other of parts.slice(index + 1)) {
        expect(overlap(part, other)).toBe(false);
      }
    }

    for (let {width, height} of layout.controls) {
      expect(Math.min(width, height)).toBeGreaterThanOrEqual(40);
    }
  });
});

describe(realSizePanel, () => {
  test('draws the device as "The panel" measures it, at the CSS px a mm given', () => {
    let pixelsPerMm = 4.5;
    let scale = MM_PER_PIXEL * pixelsPerMm;
    let inCss = ({x, y, width, height}: Rectangle) => ({
      x: toScreenPixels(x) * scale,
      y: toScreenPixels(y) * scale,
      width: toScreenPixels(width) * scale,
      height: toScreenPixels(height) * scale,
    });
    let layout = realSizePanel(pixelsPerMm);

    expect(layout.width / pixelsPerMm).toBeCloseTo(321, 0);
    expect(layout.height / pixelsPerMm).toBeCloseTo(128, 0);
    expect([layout.width, layout.height]).toEqual([
      PANEL_PIXELS.width * scale,
      PANEL_PIXELS.height * scale,
    ]);
    expect(layout.scale).toBe(scale);
    expect(layout.screen).toEqual(inCss(DISPLAY.picture));
    expect(layout.module).toEqual(inCss(DISPLAY.module));
    expect(layout.controls).toEqual(CONTROLS.map((control) => ({...control, ...inCss(control)})));
    expect(layout.row.y).toBeGreaterThan(layout.height);
  });
});

describe(expandFrame, () => {
  test('looks colours up in the palette', () => {
    let palette = new Uint8Array(256 * 3);
    palette.set([0xff, 0x7a, 0x2f], 6 * 3);
    let rgba = new Uint8ClampedArray(2 * 4);

    expandFrame(Uint8Array.from([0, 6]), palette, rgba);

    expect(rgba).toEqual(Uint8ClampedArray.from([0, 0, 0, 255, 255, 122, 47, 255]));
  });
});

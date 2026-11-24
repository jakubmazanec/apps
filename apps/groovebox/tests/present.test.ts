import {describe, expect, test} from 'vitest';

import {CONTROLS, type Rectangle} from '../source/shell/panelLayout.js';
import {type Arrangement, expandFrame, fitPanel, realSizePanel} from '../source/shell/present.js';
import {STEP_BUTTONS} from '../source/shell/protocol.js';

// The viewports of the brief, in CSS px at their display scale, with the zoom and the placement the
// report found for them and the least size of a played control: an iPhone upright and sideways in
// Safari, a Pixel 7 in Chrome, a laptop window, the owner's laptop at 125% and a full HD monitor
const VIEWPORTS = [
  {viewport: {width: 390, height: 660}, ratio: 3, zoom: 2, beside: false, least: 44},
  {viewport: {width: 750, height: 340}, ratio: 3, zoom: 2, beside: true, least: 40},
  {viewport: {width: 412, height: 780}, ratio: 2.6, zoom: 2, beside: false, least: 44},
  {viewport: {width: 1440, height: 800}, ratio: 1, zoom: 2, beside: true, least: 44},
  {viewport: {width: 1536, height: 830}, ratio: 1.25, zoom: 2, beside: true, least: 44},
  {viewport: {width: 1920, height: 960}, ratio: 1, zoom: 3, beside: true, least: 44},
];

// Phones whose fractional display scale puts the note in the row, which then wraps to three lines
const NOTED_PHONES = [
  {viewport: {width: 915, height: 356}, ratio: 2.625},
  {viewport: {width: 870, height: 356}, ratio: 2.625},
  {viewport: {width: 384, height: 650}, ratio: 2.8125},
];

// The row with the status line and the buttons: two lines of its text and three
const ROW = 40;
const TALL_ROW = 58;

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

// What keeps the layout from fitting the viewport: a size other than the viewport's, a part outside
// it or two parts that overlap. The row is `rowHeight` tall among the parts
function misfits(
  layout: Arrangement,
  viewport: {width: number; height: number},
  rowHeight: number,
) {
  let parts = [layout.screen, {...layout.row, height: rowHeight}, ...layout.controls];
  let found: string[] = [];

  if (layout.width !== viewport.width || layout.height !== viewport.height) {
    found.push(`the panel is ${layout.width} × ${layout.height}`);
  }

  for (let [index, part] of parts.entries()) {
    if (
      part.x < 0 ||
      part.y < 0 ||
      part.x + part.width > viewport.width + SLACK ||
      part.y + part.height > viewport.height + SLACK
    ) {
      found.push(`part ${index} lies outside`);
    }

    for (let [offset, other] of parts.slice(index + 1).entries()) {
      if (overlap(part, other)) {
        found.push(`parts ${index} and ${index + 1 + offset} overlap`);
      }
    }
  }

  return found;
}

describe(fitPanel, () => {
  test.each(VIEWPORTS)(
    'every control appears once with its shape and label ($viewport.width × $viewport.height at $ratio)',
    ({viewport, ratio}) => {
      let {controls} = fitPanel(viewport, ratio, () => ROW);

      expect(controls).toHaveLength(CONTROLS.length);

      for (let {control, shape, label} of CONTROLS) {
        expect(controls.filter((candidate) => candidate.control === control)).toEqual([
          expect.objectContaining({shape, label}),
        ]);
      }
    },
  );

  test.each(VIEWPORTS)(
    'the screen takes zoom $zoom, sharp at whole device pixels ($viewport.width × $viewport.height at $ratio)',
    ({viewport, ratio, zoom}) => {
      let {screen} = fitPanel(viewport, ratio, () => ROW);

      expect(screen.width * ratio).toBeCloseTo(480 * zoom);
      expect(screen.height * ratio).toBeCloseTo(272 * zoom);
      expect(screen.x * ratio).toBeCloseTo(Math.round(screen.x * ratio));
      expect(screen.y * ratio).toBeCloseTo(Math.round(screen.y * ratio));
    },
  );

  test.each(VIEWPORTS)(
    'every played control is at least $least px, a step at least 40 px tall ($viewport.width × $viewport.height at $ratio)',
    ({viewport, ratio, least}) => {
      for (let {control, width, height} of fitPanel(viewport, ratio, () => ROW).controls) {
        expect(
          Math.min(width, control.startsWith('step-') ? Infinity : height),
        ).toBeGreaterThanOrEqual(least);
        expect(height).toBeGreaterThanOrEqual(40);
      }
    },
  );

  test.each(VIEWPORTS)(
    'the rows go beside the screen: $beside ($viewport.width × $viewport.height at $ratio)',
    ({viewport, ratio, beside}) => {
      let layout = fitPanel(viewport, ratio, () => ROW);
      let {screen, row} = layout;
      let knob = at(layout, 'encoder-1');
      let firstKey = at(layout, 't1');

      expect(firstKey.x > screen.x + screen.width).toBe(beside);
      expect(firstKey.y > knob.y + knob.height).toBe(!beside);
      // The row with the status line and the buttons is the last block under the screen's knobs
      expect(row.y).toBeGreaterThan(knob.y + knob.height);
    },
  );

  test.each(VIEWPORTS)(
    'keys, steps and pads keep their rows and order, with OK above CANCEL ($viewport.width × $viewport.height at $ratio)',
    ({viewport, ratio}) => {
      let layout = fitPanel(viewport, ratio, () => ROW);
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

  test.each(VIEWPORTS)(
    'each knob sits under its strip cell ($viewport.width × $viewport.height at $ratio)',
    ({viewport, ratio}) => {
      let layout = fitPanel(viewport, ratio, () => ROW);
      let {screen} = layout;

      for (let index of [0, 1, 2, 3]) {
        let knob = at(layout, `encoder-${index + 1}`);

        expect(centre(knob).x).toBeCloseTo(screen.x + ((index + 0.5) * screen.width) / 4);
        expect(knob.y).toBeGreaterThan(screen.y + screen.height);
      }
    },
  );

  test.each(VIEWPORTS)(
    'nothing overlaps and everything lies inside the viewport ($viewport.width × $viewport.height at $ratio)',
    ({viewport, ratio}) => {
      expect(
        misfits(
          fitPanel(viewport, ratio, () => ROW),
          viewport,
          ROW,
        ),
      ).toEqual([]);
    },
  );

  test.each([...VIEWPORTS, ...NOTED_PHONES])(
    'a row three lines tall still fits with no scrolling ($viewport.width × $viewport.height at $ratio)',
    ({viewport, ratio}) => {
      expect(
        misfits(
          fitPanel(viewport, ratio, () => TALL_ROW),
          viewport,
          TALL_ROW,
        ),
      ).toEqual([]);
    },
  );

  test('the row is as tall as its text at its own width', () => {
    let viewport = {width: 750, height: 340};
    // Two lines at the screen's 320 px beside it, one line wider
    let layout = fitPanel(viewport, 3, (width: number) => (width < 360 ? ROW : 18));

    expect(layout.row.width).toBeCloseTo(320);

    expect(misfits(layout, viewport, ROW)).toEqual([]);
  });

  test('steps are flatter than keys, as in the report, so knobs and pads get the height', () => {
    // An iPhone upright in Safari with the row on one line
    let layout = fitPanel({width: 390, height: 660}, 3, () => 18);
    let key = at(layout, 't1');
    let step = at(layout, 'step-1');

    expect([step.width, step.height]).toEqual([key.width, 40]);
    expect(key.height).toBeCloseTo(44.1, 1);
    expect(at(layout, 'encoder-1').width).toBeGreaterThanOrEqual(56);
    expect(at(layout, 'pad-0').height).toBeGreaterThanOrEqual(56);
  });

  test('on a tie of zooms the larger keys win', () => {
    // At zoom 1 the keys under the screen are about 77 px tall and those beside it 59 px
    let layout = fitPanel({width: 1000, height: 1000}, 1, () => ROW);

    expect(layout.screen.width).toBe(480);
    expect(at(layout, 't1').y).toBeGreaterThan(layout.screen.y + layout.screen.height);
    expect(at(layout, 't1').height).toBeGreaterThan(70);
  });

  test('a viewport too small for the screen at zoom 1 with 40 px keys scrolls', () => {
    let layout = fitPanel({width: 300, height: 300}, 1, () => ROW);
    let parts = [layout.screen, ...layout.controls];

    expect(layout.screen.width).toBe(480);
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
  test('draws the device at its size in mm, to a screen pixel', () => {
    let pixelsPerMm = 4.5;
    let layout = realSizePanel(pixelsPerMm);
    // A rectangle of the layout in mm, against "The panel" in the plan
    let expectMm = (
      {x, y, width, height}: Rectangle,
      expected: [x: number, y: number, width: number, height: number],
    ) => {
      for (let [index, mm] of [x, y, width, height].map((css) => css / pixelsPerMm).entries()) {
        expect(Math.abs(mm - (expected[index] ?? 0))).toBeLessThanOrEqual(0.198);
      }
    };

    expectMm({x: 0, y: 0, width: layout.width, height: layout.height}, [0, 0, 321, 128]);
    expectMm(layout.screen, [93, 14.75, 95.04, 53.86]);
    expectMm(layout.module ?? {x: 0, y: 0, width: 0, height: 0}, [87.75, 8, 105.5, 67.2]);
    expectMm(at(layout, 'volume'), [8, 8, 22, 22]);
    expectMm(at(layout, 'encoder-4'), [291, 8, 22, 22]);
    expectMm(at(layout, 't1'), [241, 48, 12, 12]);
    expectMm(at(layout, 'step-16'), [233, 80, 12, 10]);
    expectMm(at(layout, 'cancel'), [298, 100, 12, 18]);
    expectMm(at(layout, 'pad-11'), [228, 100, 17, 17]);

    expect(layout.controls).toHaveLength(CONTROLS.length);
    // Radii, borders and labels at 0.198 mm a screen pixel
    expect(layout.scale / pixelsPerMm).toBeCloseTo(0.198);
    expect(layout.labelsUnderKnobs).toBe(true);
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

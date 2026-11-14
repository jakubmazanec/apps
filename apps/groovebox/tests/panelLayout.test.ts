import {describe, expect, test} from 'vitest';

import {
  CONTROLS,
  DISPLAY,
  MM_PER_PIXEL,
  PANEL_MM,
  PANEL_PIXELS,
  toScreenPixels,
} from '../source/shell/panelLayout.js';
import {BUTTONS} from '../source/shell/protocol.js';

type Rectangle = {x: number; y: number; width: number; height: number};

function inPixels(rectangle: Rectangle): Rectangle {
  return {
    x: toScreenPixels(rectangle.x),
    y: toScreenPixels(rectangle.y),
    width: toScreenPixels(rectangle.width),
    height: toScreenPixels(rectangle.height),
  };
}

function overlap(a: Rectangle, b: Rectangle) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('the panel', () => {
  test('is 321 × 128 mm at 0.198 mm a screen pixel, 1,622 × 647 pixels', () => {
    expect(PANEL_MM).toStrictEqual({width: 321, height: 128});
    expect(MM_PER_PIXEL).toBe(0.198);
    expect(PANEL_PIXELS).toStrictEqual({width: 1622, height: 647});
  });

  test('positions round to the nearest pixel', () => {
    expect(toScreenPixels(0)).toBe(0);
    expect(toScreenPixels(12)).toBe(61);
    expect(toScreenPixels(93)).toBe(470);
    expect(toScreenPixels(14.75)).toBe(74);
  });
});

describe('the display', () => {
  test('picture is exactly 480 × 272 screen pixels at its rounded position', () => {
    expect(inPixels(DISPLAY.picture)).toStrictEqual({x: 470, y: 74, width: 480, height: 272});
  });

  test('picture lies inside its module', () => {
    let module = inPixels(DISPLAY.module);
    let picture = inPixels(DISPLAY.picture);

    expect(picture.x).toBeGreaterThanOrEqual(module.x);
    expect(picture.y).toBeGreaterThanOrEqual(module.y);
    expect(picture.x + picture.width).toBeLessThanOrEqual(module.x + module.width);
    expect(picture.y + picture.height).toBeLessThanOrEqual(module.y + module.height);
  });
});

describe('the controls', () => {
  test('are the 22 function buttons, 16 steps, the 4 encoders, the volume and 12 pads', () => {
    expect(CONTROLS).toHaveLength(22 + 16 + 4 + 1 + 12);
    expect(new Set(CONTROLS.map(({control}) => control)).size).toBe(CONTROLS.length);
    expect(
      CONTROLS.filter(({control}) => control in BUTTONS)
        .map(({control}) => BUTTONS[control as keyof typeof BUTTONS])
        .toSorted((a, b) => a - b),
    ).toStrictEqual([
      ...Array.from({length: 22}, (_, code) => code),
      ...Array.from({length: 16}, (_, step) => 32 + step),
    ]);
    expect(
      CONTROLS.filter(({shape}) => shape === 'knob').map(({control}) => control),
    ).toStrictEqual(['volume', 'encoder-1', 'encoder-2', 'encoder-3', 'encoder-4']);
    expect(CONTROLS.filter(({shape}) => shape === 'pad').map(({control}) => control)).toStrictEqual(
      Array.from({length: 12}, (_, pad) => `pad-${pad}`),
    );
  });

  test.each<[string, [number, number, number, number]]>([
    ['volume', [8, 8, 22, 22]],
    ['encoder-1', [216, 8, 22, 22]],
    ['encoder-4', [291, 8, 22, 22]],
    ['t1', [241, 48, 12, 12]],
    ['t4', [286, 48, 12, 12]],
    ['pads-keys', [301, 48, 12, 12]],
    ['roll', [241, 63, 12, 12]],
    ['shift', [301, 63, 12, 12]],
    ['rec', [8, 63, 12, 12]],
    ['tempo', [53, 63, 12, 12]],
    ['step-1', [8, 80, 12, 10]],
    ['step-16', [233, 80, 12, 10]],
    ['minus', [253, 80, 12, 18]],
    ['ok', [298, 80, 12, 18]],
    ['left', [253, 100, 12, 18]],
    ['cancel', [298, 100, 12, 18]],
    ['pad-0', [8, 100, 17, 17]],
    ['pad-11', [228, 100, 17, 17]],
  ])('%s sits where "The panel" measures it', (control, [x, y, width, height]) => {
    expect(CONTROLS.find((candidate) => candidate.control === control)).toMatchObject({
      x,
      y,
      width,
      height,
    });
  });

  test('every control lies inside the panel and no two overlap', () => {
    let rectangles = CONTROLS.map((control) => inPixels(control));

    for (let [index, rectangle] of rectangles.entries()) {
      expect(rectangle.x).toBeGreaterThanOrEqual(0);
      expect(rectangle.y).toBeGreaterThanOrEqual(0);
      expect(rectangle.x + rectangle.width).toBeLessThanOrEqual(PANEL_PIXELS.width);
      expect(rectangle.y + rectangle.height).toBeLessThanOrEqual(PANEL_PIXELS.height);

      for (let other of rectangles.slice(index + 1)) {
        expect(overlap(rectangle, other)).toBe(false);
      }

      expect(overlap(rectangle, inPixels(DISPLAY.module))).toBe(false);
    }
  });

  test('every control has a label', () => {
    expect(CONTROLS.every(({label}) => label.length > 0)).toBe(true);
    expect(CONTROLS.find(({control}) => control === 'volume')?.label).toBe('VOL');
    expect(CONTROLS.find(({control}) => control === 'pads-keys')?.label).toBe('PADS');
    expect(CONTROLS.find(({control}) => control === 'encoder-3')?.label).toBe('3');
  });

  test('the arrows are the four triangles that fonts carry together', () => {
    let labels = ['up', 'down', 'left', 'right'].map(
      (name) => CONTROLS.find(({control}) => control === name)?.label,
    );

    expect(labels).toEqual(['▲', '▼', '◄', '►']);
  });
});

import {decode} from 'fast-png';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, test} from 'vitest';

import {drawUiAtlas} from '../scripts/generate-ui-atlas.mjs';
import {palette} from '../source/game/core/palette.js';
import {theme} from '../source/game/core/theme.js';

type Frame = {
  x: number;
  y: number;
  width: number;
  height: number;
  borders?: {left: number; top: number; right: number; bottom: number};
};

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));

function getFrames(json: string): Record<string, Frame> {
  return (JSON.parse(json) as {frames: Record<string, Frame>}).frames;
}

// Collects every ['ui', name] tuple of the theme.
function collectFrameNames(value: unknown, names: string[]): void {
  if (Array.isArray(value)) {
    if (value.length === 2 && value[0] === 'ui' && typeof value[1] === 'string') {
      names.push(value[1]);
    }

    return;
  }

  if (typeof value === 'object' && value !== null) {
    for (let child of Object.values(value)) {
      collectFrameNames(child, names);
    }
  }
}

describe(drawUiAtlas, () => {
  test('the image and the JSON equal the files in public/', () => {
    let {png, json} = drawUiAtlas();

    expect(Buffer.from(png).equals(readFileSync(`${PUBLIC}ui.png`))).toBe(true);
    expect(json).toBe(readFileSync(`${PUBLIC}ui.json`, 'utf8'));
  });

  test('two calls give the same bytes', () => {
    let first = drawUiAtlas();
    let second = drawUiAtlas();

    expect(Buffer.from(first.png).equals(Buffer.from(second.png))).toBe(true);
    expect(first.json).toBe(second.json);
  });

  test('every frame the theme names exists', () => {
    let names: string[] = [];

    collectFrameNames(theme, names);
    names.push('rule', 'cursor');

    let frames = getFrames(drawUiAtlas().json);

    for (let name of names) {
      expect(Object.keys(frames)).toContain(name);
    }
  });

  test('every frame lies inside the image and no two overlap', () => {
    let {png, json} = drawUiAtlas();
    let image = decode(png);
    let frames = Object.values(getFrames(json));

    for (let [index, frame] of frames.entries()) {
      expect(frame.x).toBeGreaterThanOrEqual(0);
      expect(frame.y).toBeGreaterThanOrEqual(0);
      expect(frame.x + frame.width).toBeLessThanOrEqual(image.width);
      expect(frame.y + frame.height).toBeLessThanOrEqual(image.height);

      for (let other of frames.slice(index + 1)) {
        let apart =
          frame.x + frame.width <= other.x ||
          other.x + other.width <= frame.x ||
          frame.y + frame.height <= other.y ||
          other.y + other.height <= frame.y;

        expect(apart).toBe(true);
      }
    }
  });

  test("every frame's borders fit inside it", () => {
    let frames = Object.values(getFrames(drawUiAtlas().json)).filter(
      (frame) => frame.borders !== undefined,
    );

    for (let {borders = {left: 0, top: 0, right: 0, bottom: 0}, width, height} of frames) {
      expect(borders.left + borders.right).toBeLessThan(width);
      expect(borders.top + borders.bottom).toBeLessThan(height);
    }
  });

  test('every opaque pixel is a palette colour', () => {
    let {data} = decode(drawUiAtlas().png);
    let colors = new Set(
      Object.values(palette).map((value) => value.toString(16).padStart(6, '0')),
    );
    let opaque: string[] = [];
    let alphas = new Set<number>();

    for (let offset = 0; offset < data.length; offset += 4) {
      let alpha = data[offset + 3] ?? 0;

      alphas.add(alpha);

      if (alpha !== 0) {
        opaque.push(
          [0, 1, 2]
            .map((channel) => (data[offset + channel] ?? 0).toString(16).padStart(2, '0'))
            .join(''),
        );
      }
    }

    expect([...alphas].toSorted((a, b) => a - b)).toEqual([0, 255]);
    expect(opaque.filter((color) => !colors.has(color))).toEqual([]);
  });
});

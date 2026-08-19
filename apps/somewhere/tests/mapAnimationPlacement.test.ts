import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';

import {
  findChild,
  findChildren,
  getAttribute,
  parseXmlDocument,
} from '../tools/tiled-pipeline/tsx.js';

// The spec's placement table, hardcoded on purpose: the test is the spec, the
// script is the implementation, so a script that reads the wrong cell fails
// the test instead of being trusted by it.
//
// The small fire is two tiles tall: strip 353-358 draws its top half, strip
// 417-422 the bottom half, stacked in the atlas (column 33, rows 5 and 6), so
// one flame needs both carriers: gid 354 in the cell above gid 418 (tile +
// firstgid 1). One flame sits over each of the three cook-pots (`stuff` layer
// gids 73/75/77 at the lower cells); the `animations` layer draws above
// `stuff`, so the flame renders on the pot.
//
// The large fire (strips 481-486 over 545-550, gids 482 and 546) burns on the
// camp's log pile, the same two-carrier shape one cell higher: the pile (gid
// 1503) sits in the lower cell, on the axis the barrels and pots share.
const CARRIERS = [
  {layer: 'animations', x: 6, y: 30, tile: 354},
  {layer: 'animations', x: 8, y: 30, tile: 354},
  {layer: 'animations', x: 10, y: 30, tile: 354},
  {layer: 'animations', x: 6, y: 31, tile: 418},
  {layer: 'animations', x: 8, y: 31, tile: 418},
  {layer: 'animations', x: 10, y: 31, tile: 418},
  {layer: 'animations', x: 8, y: 27, tile: 482},
  {layer: 'animations', x: 8, y: 28, tile: 546},
];
const HEARTHS = [
  {layer: 'stuff', x: 6, y: 31, tile: 73},
  {layer: 'stuff', x: 8, y: 31, tile: 75},
  {layer: 'stuff', x: 10, y: 31, tile: 77},
  {layer: 'stuff', x: 8, y: 28, tile: 1503},
];
// The hut roofs and walls the first placement run wrongly overwrote with
// carriers: left/middle/right slices of one drawing, not animation frames.
// They must stay static, distinct gids. The middle gid is the door: it was
// moved here from the air layer (which Map.ts never y-sorts) so the player
// can render in front of it, same as any other entities-layer object.
const STRUCTURES = [
  {
    layer: 'stuff',
    gids: [193, 1306, 195],
    anchors: [
      {x: 10, y: 10},
      {x: 29, y: 29},
    ],
  },
  {
    layer: 'air',
    gids: [582, 583, 584],
    anchors: [
      {x: 10, y: 7},
      {x: 5, y: 22},
      {x: 29, y: 26},
    ],
  },
  {
    layer: 'air',
    gids: [646, 647, 648],
    anchors: [
      {x: 10, y: 8},
      {x: 5, y: 23},
      {x: 29, y: 27},
    ],
  },
];

function tmxRows(name: string): number[][] {
  let text = readFileSync(new URL('../assets/map.tmx', import.meta.url), 'utf8');
  let layer = findChildren(parseXmlDocument(text).root, 'layer').find(
    (entry) => getAttribute(entry, 'name') === name,
  )!;
  let data = findChild(layer, 'data')!;

  return data
    .text!.split(/\r?\n/u)
    .filter((line) => line.trim() !== '')
    .map((line) =>
      line
        .split(',')
        .filter((token) => token !== '')
        .map(Number),
    );
}

function jsonRows(name: string): number[][] {
  let map = JSON.parse(readFileSync(new URL('../public/map.json', import.meta.url), 'utf8')) as {
    width: number;
    layers: Array<{name: string; data?: number[]}>;
  };
  let layer = map.layers.find((entry) => entry.name === name)!;
  let data = layer.data!;

  return Array.from({length: map.width}, (unused, y) =>
    data.slice(y * map.width, (y + 1) * map.width),
  );
}

function expectCarriersOverHearths(readRows: (name: string) => number[][]) {
  for (let carrier of CARRIERS) {
    expect(readRows(carrier.layer)[carrier.y]![carrier.x]).toBe(carrier.tile);
  }

  for (let hearth of HEARTHS) {
    expect(readRows(hearth.layer)[hearth.y]![hearth.x]).toBe(hearth.tile);
  }
}

function expectStaticStructures(readRows: (name: string) => number[][]) {
  for (let structure of STRUCTURES) {
    for (let anchor of structure.anchors) {
      let row = readRows(structure.layer)[anchor.y]!;

      for (let [offset, gid] of structure.gids.entries()) {
        expect(row[anchor.x + offset]).toBe(gid);
      }
    }
  }
}

function expectNoStrayCarriers(readRows: (name: string) => number[][]) {
  let allowed = new Set(CARRIERS.map((carrier) => `${carrier.x},${carrier.y}`));

  for (let [y, row] of readRows('animations').entries()) {
    for (let [x, gid] of row.entries()) {
      if (gid !== 0) {
        expect(allowed.has(`${x},${y}`)).toBe(true);
      }
    }
  }
}

describe('the map animation carriers', () => {
  // eslint-disable-next-line vitest/expect-expect -- assertions live in the expect* helpers
  test('assets/map.tmx places a flame carrier on each hearth and nothing else', () => {
    expectCarriersOverHearths(tmxRows);
    expectStaticStructures(tmxRows);
    expectNoStrayCarriers(tmxRows);
  });

  // eslint-disable-next-line vitest/expect-expect -- assertions live in the expect* helpers
  test('public/map.json mirrors the TMX placement', () => {
    expectCarriersOverHearths(jsonRows);
    expectStaticStructures(jsonRows);
    expectNoStrayCarriers(jsonRows);
  });
});

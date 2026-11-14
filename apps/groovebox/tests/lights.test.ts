/* eslint-disable no-bitwise -- the lights are the bits of one word */
import {describe, expect, test} from 'vitest';

import {decodeLights} from '../source/shell/lights.js';

function bits(...lit: number[]) {
  return lit.reduce((word, bit) => word | (1n << BigInt(bit)), 0n);
}

function litIndexes(flags: boolean[]) {
  return flags.flatMap((lit, index) => (lit ? [index] : []));
}

describe(decodeLights, () => {
  test('no bits light nothing', () => {
    let lights = decodeLights(0n);

    expect(lights.pads).toHaveLength(12);
    expect(lights.steps).toHaveLength(16);
    expect(lights.tracks).toHaveLength(4);
    expect(litIndexes([...lights.pads, ...lights.steps, ...lights.tracks])).toStrictEqual([]);
    expect([lights.padsKeys, lights.roll, lights.rec, lights.play, lights.tempo]).toStrictEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  test('bits map to the lights table', () => {
    let lights = decodeLights(bits(0, 11, 12, 27, 28, 31, 32));

    expect(litIndexes(lights.pads)).toStrictEqual([0, 11]);
    expect(litIndexes(lights.steps)).toStrictEqual([0, 15]);
    expect(litIndexes(lights.tracks)).toStrictEqual([0, 3]);
    expect(lights.padsKeys).toBe(true);
    expect([lights.roll, lights.rec, lights.play, lights.tempo]).toStrictEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  test('ROLL, REC, PLAY and TEMPO have bits 33 to 36', () => {
    expect(decodeLights(bits(33))).toMatchObject({roll: true, rec: false, play: false});
    expect(decodeLights(bits(34))).toMatchObject({roll: false, rec: true, play: false});
    expect(decodeLights(bits(35))).toMatchObject({rec: false, play: true, tempo: false});
    expect(decodeLights(bits(36))).toMatchObject({play: false, tempo: true, padsKeys: false});
  });

  test('every one of the 37 bits lights exactly its own light', () => {
    for (let bit = 0; bit < 37; bit++) {
      let lights = decodeLights(bits(bit));
      let flags = [
        ...lights.pads,
        ...lights.steps,
        ...lights.tracks,
        lights.padsKeys,
        lights.roll,
        lights.rec,
        lights.play,
        lights.tempo,
      ];

      expect(litIndexes(flags)).toStrictEqual([bit]);
    }
  });

  test('bits above 36 light nothing', () => {
    let lights = decodeLights(bits(37, 50, 63));

    expect(
      litIndexes([
        ...lights.pads,
        ...lights.steps,
        ...lights.tracks,
        lights.padsKeys,
        lights.roll,
        lights.rec,
        lights.play,
        lights.tempo,
      ]),
    ).toStrictEqual([]);
  });
});

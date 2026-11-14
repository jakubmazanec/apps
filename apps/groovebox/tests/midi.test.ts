import {describe, expect, test} from 'vitest';

import {createMidiMapper, KNOBS} from '../source/shell/midi.js';

function message(...bytes: number[]) {
  return Uint8Array.from(bytes);
}

describe(createMidiMapper, () => {
  test('notes, velocity 0 and pressure on any channel', () => {
    let map = createMidiMapper();

    expect(map(message(0x90, 60, 100))).toStrictEqual([{kind: 'note-on', note: 60, velocity: 100}]);
    expect(map(message(0x9f, 36, 1))).toStrictEqual([{kind: 'note-on', note: 36, velocity: 1}]);
    expect(map(message(0x90, 60, 0))).toStrictEqual([{kind: 'note-off', note: 60}]);
    expect(map(message(0x93, 60, 0))).toStrictEqual([{kind: 'note-off', note: 60}]);
    expect(map(message(0x80, 60, 64))).toStrictEqual([{kind: 'note-off', note: 60}]);
    expect(map(message(0x8a, 127, 0))).toStrictEqual([{kind: 'note-off', note: 127}]);
    expect(map(message(0xa0, 60, 33))).toStrictEqual([
      {kind: 'note-pressure', note: 60, pressure: 33},
    ]);
    expect(map(message(0xa7, 61, 0))).toStrictEqual([
      {kind: 'note-pressure', note: 61, pressure: 0},
    ]);
    expect(map(message(0xd0, 99))).toStrictEqual([{kind: 'channel-pressure', pressure: 99}]);
    expect(map(message(0xd5, 0))).toStrictEqual([{kind: 'channel-pressure', pressure: 0}]);
  });

  test('an absolute knob turns by its change and its first value only sets the reference', () => {
    let map = createMidiMapper();

    expect(map(message(0xb0, 20, 70))).toStrictEqual([]);
    expect(map(message(0xb0, 20, 74))).toStrictEqual([{kind: 'turn', encoder: 0, clicks: 4}]);
    expect(map(message(0xb0, 20, 72))).toStrictEqual([{kind: 'turn', encoder: 0, clicks: -2}]);
    expect(map(message(0xb0, 20, 72))).toStrictEqual([]);
    expect(map(message(0xb0, 20, 127))).toStrictEqual([{kind: 'turn', encoder: 0, clicks: 55}]);
    expect(map(message(0xb0, 20, 0))).toStrictEqual([{kind: 'turn', encoder: 0, clicks: -127}]);
  });

  test('each knob, channel and mapper keeps its own reference', () => {
    let map = createMidiMapper();

    expect(map(message(0xb0, 20, 10))).toStrictEqual([]);
    expect(map(message(0xb0, 21, 100))).toStrictEqual([]);
    expect(map(message(0xb1, 20, 90))).toStrictEqual([]);
    expect(map(message(0xb0, 21, 101))).toStrictEqual([{kind: 'turn', encoder: 1, clicks: 1}]);
    expect(map(message(0xb1, 20, 88))).toStrictEqual([{kind: 'turn', encoder: 0, clicks: -2}]);
    expect(map(message(0xb0, 20, 12))).toStrictEqual([{kind: 'turn', encoder: 0, clicks: 2}]);
    expect(createMidiMapper()(message(0xb0, 20, 50))).toStrictEqual([]);
  });

  test('a relative knob turns by its two’s complement step', () => {
    let map = createMidiMapper(new Map([[20, {encoder: 0, kind: 'relative'}]]));

    expect(map(message(0xb0, 20, 3))).toStrictEqual([{kind: 'turn', encoder: 0, clicks: 3}]);
    expect(map(message(0xb0, 20, 125))).toStrictEqual([{kind: 'turn', encoder: 0, clicks: -3}]);
    expect(map(message(0xb0, 20, 1))).toStrictEqual([{kind: 'turn', encoder: 0, clicks: 1}]);
    expect(map(message(0xb0, 20, 63))).toStrictEqual([{kind: 'turn', encoder: 0, clicks: 63}]);
    expect(map(message(0xb0, 20, 65))).toStrictEqual([{kind: 'turn', encoder: 0, clicks: -63}]);
    expect(map(message(0xb0, 20, 127))).toStrictEqual([{kind: 'turn', encoder: 0, clicks: -1}]);
    expect(map(message(0xb0, 20, 0))).toStrictEqual([]);
    expect(map(message(0xb0, 20, 64))).toStrictEqual([]);
  });

  test('CC 20 to 23 turn the encoders, CC 7 the volume and other numbers do nothing', () => {
    let map = createMidiMapper();

    for (let [controller, encoder] of [
      [20, 0],
      [21, 1],
      [22, 2],
      [23, 3],
      [7, 4],
    ] as const) {
      expect(map(message(0xb0, controller, 10))).toStrictEqual([]);
      expect(map(message(0xb0, controller, 12))).toStrictEqual([
        {kind: 'turn', encoder, clicks: 2},
      ]);
    }

    for (let controller of [0, 1, 6, 8, 19, 24, 64, 120]) {
      expect(map(message(0xb0, controller, 10))).toStrictEqual([]);
      expect(map(message(0xb0, controller, 12))).toStrictEqual([]);
    }
  });

  test('every other message gives nothing', () => {
    let map = createMidiMapper();

    expect(map(message(0xc0, 5))).toStrictEqual([]);
    expect(map(message(0xe0, 0, 64))).toStrictEqual([]);
    expect(map(message(0xf8))).toStrictEqual([]);
    expect(map(message(0xfa))).toStrictEqual([]);
    expect(map(message(0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7))).toStrictEqual([]);
    expect(map(message(0xf2, 1, 2))).toStrictEqual([]);
    expect(map(message(0x20, 1, 2))).toStrictEqual([]);
    expect(map(message())).toStrictEqual([]);
  });

  test('a message that is cut short gives nothing', () => {
    let map = createMidiMapper();

    expect(map(message(0x90))).toStrictEqual([]);
    expect(map(message(0x90, 60))).toStrictEqual([]);
    expect(map(message(0xa0, 60))).toStrictEqual([]);
    expect(map(message(0xb0, 20))).toStrictEqual([]);
    expect(map(message(0xd0))).toStrictEqual([]);
  });
});

describe('KNOBS', () => {
  test('holds the four encoders and the volume, all absolute', () => {
    expect([...KNOBS]).toStrictEqual([
      [20, {encoder: 0, kind: 'absolute'}],
      [21, {encoder: 1, kind: 'absolute'}],
      [22, {encoder: 2, kind: 'absolute'}],
      [23, {encoder: 3, kind: 'absolute'}],
      [7, {encoder: 4, kind: 'absolute'}],
    ]);
  });
});

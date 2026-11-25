import {describe, expect, test} from 'vitest';

import {BUTTONS, coreArguments, encoderName, type ShellInput} from '../source/shell/protocol.js';

describe('BUTTONS', () => {
  test('holds the codes of the shared table', () => {
    expect(Object.entries(BUTTONS).filter(([, code]) => code < 32)).toStrictEqual([
      ['t1', 0],
      ['t2', 1],
      ['t3', 2],
      ['t4', 3],
      ['pads-keys', 4],
      ['roll', 5],
      ['menu', 6],
      ['page', 7],
      ['copy', 8],
      ['shift', 9],
      ['rec', 10],
      ['play', 11],
      ['stop', 12],
      ['tempo', 13],
      ['up', 14],
      ['down', 15],
      ['left', 16],
      ['right', 17],
      ['ok', 18],
      ['cancel', 19],
      ['minus', 20],
      ['plus', 21],
    ]);
    expect([BUTTONS['step-1'], BUTTONS['step-9'], BUTTONS['step-16']]).toStrictEqual([32, 40, 47]);
    expect([BUTTONS['push-1'], BUTTONS['push-4']]).toStrictEqual([48, 51]);
    expect(Object.keys(BUTTONS)).toHaveLength(42);
    expect(new Set(Object.values(BUTTONS)).size).toBe(42);
  });
});

describe(encoderName, () => {
  test('names the four encoders from 1 and the volume', () => {
    expect([0, 1, 2, 3, 4].map(encoderName)).toStrictEqual([
      'encoder-1',
      'encoder-2',
      'encoder-3',
      'encoder-4',
      'volume',
    ]);
  });
});

describe(coreArguments, () => {
  test.each<[ShellInput, [number, number, number]]>([
    [{kind: 'pad-hit', pad: 11, velocity: 127}, [0, 11, 127]],
    [{kind: 'pad-release', pad: 3}, [1, 3, 0]],
    [{kind: 'pad-pressure', pad: 2, pressure: 90}, [2, 2, 90]],
    [{kind: 'press', button: 'menu'}, [3, 6, 0]],
    [{kind: 'press', button: 'step-16'}, [3, 47, 0]],
    [{kind: 'release', button: 'push-4'}, [4, 51, 0]],
    [{kind: 'turn', encoder: 4, clicks: 127}, [5, 4, 127]],
    [{kind: 'turn', encoder: 0, clicks: -3}, [5, 0, -3]],
    [{kind: 'note-on', note: 60, velocity: 100}, [6, 60, 100]],
    [{kind: 'note-off', note: 127}, [7, 127, 0]],
    [{kind: 'note-pressure', note: 60, pressure: 0}, [8, 60, 0]],
    [{kind: 'channel-pressure', pressure: 64}, [9, 64, 0]],
    [{kind: 'dropped', files: 65_535}, [10, 65_535, 0]],
    [{kind: 'output-delay', samples: 1200}, [11, 1200, 0]],
  ])('%o is %j', (input, expected) => {
    expect(coreArguments(input)).toStrictEqual(expected);
  });
});

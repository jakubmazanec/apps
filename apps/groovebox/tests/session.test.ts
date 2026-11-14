import {describe, expect, test} from 'vitest';

import {type StampedInput} from '../source/shell/protocol.js';
import {SessionLog} from '../source/shell/session.js';

describe(SessionLog, () => {
  test('writes the scene format', () => {
    let log = new SessionLog();

    log.input({sample: 100n, input: {kind: 'pad-hit', pad: 0, velocity: 127}});
    log.step(128n);
    log.applied(0, 128n);
    log.input({sample: 300n, input: {kind: 'pad-release', pad: 0}});
    log.step(384n);

    expect(log.finish(512n, 0xabcn)).toBe(
      'groovebox-scene 1\ninput 100 pad-hit 0 127\nstep 128\napplied 0 128\ninput 300 pad-release 0\nstep 384\nexpect-audio 512 0000000000000abc\nend 512\n',
    );
  });

  test('every input kind writes its scene line', () => {
    let log = new SessionLog();
    let inputs: Array<StampedInput['input']> = [
      {kind: 'pad-hit', pad: 11, velocity: 1},
      {kind: 'pad-release', pad: 11},
      {kind: 'pad-pressure', pad: 2, pressure: 90},
      {kind: 'press', button: 'pads-keys'},
      {kind: 'release', button: 'pads-keys'},
      {kind: 'press', button: 'step-16'},
      {kind: 'release', button: 'push-4'},
      {kind: 'turn', encoder: 0, clicks: 3},
      {kind: 'turn', encoder: 3, clicks: -127},
      {kind: 'turn', encoder: 4, clicks: 1},
      {kind: 'note-on', note: 60, velocity: 127},
      {kind: 'note-off', note: 60},
      {kind: 'note-pressure', note: 60, pressure: 0},
      {kind: 'channel-pressure', pressure: 99},
    ];

    for (let [index, input] of inputs.entries()) {
      log.input({sample: BigInt(index) * 10n, input});
    }

    expect(log.finish(512n, 0n).split('\n').slice(1, -3)).toStrictEqual([
      'input 0 pad-hit 11 1',
      'input 10 pad-release 11',
      'input 20 pad-pressure 2 90',
      'input 30 press pads-keys',
      'input 40 release pads-keys',
      'input 50 press step-16',
      'input 60 release push-4',
      'input 70 turn encoder-1 3',
      'input 80 turn encoder-4 -127',
      'input 90 turn volume 1',
      'input 100 note-on 60 127',
      'input 110 note-off 60',
      'input 120 note-pressure 60 0',
      'input 130 channel-pressure 99',
    ]);
  });

  test('writes a negative fingerprint as 64 unsigned bits', () => {
    expect(new SessionLog().finish(512n, -1n)).toContain('expect-audio 512 ffffffffffffffff\n');
  });
});

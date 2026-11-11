import {describe, expect, test} from 'vitest';

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
});

import {describe, expect, test} from 'vitest';

import {flags, resetFlags} from '../source/game/flags.js';

describe('flags', () => {
  test('resetFlags restores the defaults', () => {
    flags.metMira = true;
    resetFlags();

    expect(flags.metMira).toBeFalsy();
  });
});
